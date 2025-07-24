import express from "express";
import cors from "cors";
import neo4j from "neo4j-driver";

const app = express();
app.use(cors());

const driver = neo4j.driver(
  "neo4j+s://f499b30f.databases.neo4j.io",
  neo4j.auth.basic("neo4j", "f5WuJZc5uBGxWJ4AJInjgPZQD99OYd8inNQ4FyHZ6DE")
);

// Endpoint: precios por cantón o provincia (soporta varios)
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

// Puerto
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API corriendo en puerto ${port}`);
});
