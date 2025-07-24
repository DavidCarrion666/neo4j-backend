import express from "express";
import cors from "cors";
import neo4j from "neo4j-driver";

const app = express();
app.use(cors());

const driver = neo4j.driver(
  "neo4j+s://f499b30f.databases.neo4j.io",
  neo4j.auth.basic("neo4j", "f5WuJZc5uBGxWJ4AJInjgPZQD99OYd8inNQ4FyHZ6DE")
);

// ------------------------------------------
// ENDPOINTS ORIGINALES
// ------------------------------------------

// Endpoint: precios por cantón o provincia (multi-select)
app.get("/api/precios", async (req, res) => {
  const { canton, provincia } = req.query;
  const session = driver.session({ database: "neo4j" });

  try {
    let cypher, params;
    if (canton) {
      // Permitir varios cantones (separados por coma)
      const cantones = canton.split(",").map(x => x.trim());
      cypher = `
        MATCH (c:Canton)-[:REGISTRA_PRECIO]->(precio)
        WHERE c.nombre IN $cantones
        RETURN precio, c
        ORDER BY precio.anio, precio.mes, c.nombre
      `;
      params = { cantones };
    } else if (provincia) {
      // Permitir varias provincias (separadas por coma)
      const provincias = provincia.split(",").map(x => x.trim());
      cypher = `
        MATCH (p:Provincia)-[:TIENE_CANTON]->(c:Canton)-[:REGISTRA_PRECIO]->(precio)
        WHERE p.nombre IN $provincias
        RETURN precio, p, c
        ORDER BY p.nombre, c.nombre, precio.anio, precio.mes
      `;
      params = { provincias };
    } else {
      return res.status(400).json({ error: "Debes especificar ?canton= o ?provincia=" });
    }

    const result = await session.run(cypher, params);
    const precios = result.records.map(r => {
      const p = r.get("precio").properties;
      const c = r.get("c").properties.nombre;
      if (provincia) {
        const prov = r.get("p").properties.nombre;
        return { ...p, canton: c, provincia: prov, origen: prov };
      } else {
        return { ...p, canton: c, origen: c };
      }
    });
    res.json(precios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Endpoint: lista de cantones
app.get("/api/cantones", async (req, res) => {
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      "MATCH (c:Canton) RETURN DISTINCT c.nombre AS nombre ORDER BY nombre"
    );
    res.json(result.records.map(r => r.get("nombre")));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Endpoint: lista de provincias
app.get("/api/provincias", async (req, res) => {
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      "MATCH (p:Provincia) RETURN DISTINCT p.nombre AS nombre ORDER BY nombre"
    );
    res.json(result.records.map(r => r.get("nombre")));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Endpoint: lista de productos
app.get("/api/productos", async (req, res) => {
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      "MATCH (p:Producto) RETURN DISTINCT p.nombre AS nombre ORDER BY nombre"
    );
    res.json(result.records.map(r => r.get("nombre")));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Endpoint: precios promedio por año de productos (para el gráfico de barras)
app.get("/api/precios-producto", async (req, res) => {
  const { productos } = req.query;
  if (!productos) return res.status(400).json({ error: "Falta el parámetro productos" });

  const productosArr = productos.split(",").map(x => x.trim());
  const session = driver.session({ database: "neo4j" });

  try {
    const result = await session.run(
      `
      MATCH (precio)-[:ES_PARA_PRODUCTO]->(pr:Producto)
      WHERE pr.nombre IN $productos
      RETURN pr.nombre AS producto, precio.anio AS anio, AVG(toFloat(precio.valorUSD)) AS precio_prom
      ORDER BY producto, anio
      `,
      { productos: productosArr }
    );
    res.json(result.records.map(r => ({
      producto: r.get("producto"),
      anio: r.get("anio"),
      precio_prom: r.get("precio_prom")
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Endpoint: cantidad de ventas por provincia (para pie chart)
app.get("/api/ventas-por-provincia", async (req, res) => {
  const { productos } = req.query;
  if (!productos) return res.status(400).json({ error: "Falta el parámetro productos" });

  const productosArr = productos.split(",").map(x => x.trim());
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      `
      MATCH (precio)-[:ES_PARA_PRODUCTO]->(prod:Producto)
      WHERE prod.nombre IN $productos
      MATCH (precio)<-[:REGISTRA_PRECIO]-(canton:Canton)<-[:TIENE_CANTON]-(prov:Provincia)
      RETURN prov.nombre AS provincia, COUNT(precio) AS ventas
      ORDER BY ventas DESC
      `,
      { productos: productosArr }
    );
    res.json(result.records.map(r => ({
      provincia: r.get("provincia"),
      ventas: r.get("ventas").toNumber ? r.get("ventas").toNumber() : r.get("ventas")
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// ------------------------------------------
// ENDPOINTS NUEVOS PARA CONSUMO DE CAFÉ POR PAÍS
// ------------------------------------------

// Endpoint: lista de países
app.get("/api/paises", async (req, res) => {
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      "MATCH (p:Pais) RETURN DISTINCT p.nombre AS nombre ORDER BY nombre"
    );
    res.json(result.records.map(r => r.get("nombre")));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await session.close();
  }
});

// Endpoint: consumo histórico por país (devuelve consumo como número)
app.get("/api/consumo", async (req, res) => {
  const { paises } = req.query;
  if (!paises) return res.status(400).json({ error: "Falta el parámetro paises" });

  const paisesArr = paises.split(",").map(x => x.trim());
  const session = driver.session({ database: "neo4j" });

  try {
    const cypher = `
      MATCH (p:Pais)-[c:CONSUMED]->(t:CoffeeType)
      WHERE p.nombre IN $paises
      RETURN p.nombre AS pais, c.year AS anio, SUM(toFloat(c.value)) AS consumo
      ORDER BY pais, anio
    `;
    const params = { paises: paisesArr };

    const result = await session.run(cypher, params);
    const consumo = result.records.map(r => ({
      pais: r.get("pais"),
      anio: r.get("anio"),
      consumo: r.get("consumo") && r.get("consumo").toNumber
        ? r.get("consumo").toNumber()
        : r.get("consumo")
    }));
    res.json(consumo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// ------------------------------------------
// INICIAR SERVIDOR
// ------------------------------------------

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API corriendo en puerto ${port}`);
});
