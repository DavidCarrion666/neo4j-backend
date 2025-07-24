import express from "express";
import cors from "cors";
import neo4j from "neo4j-driver";

const app = express();
app.use(cors());

const driver = neo4j.driver(
  "neo4j+s://f499b30f.databases.neo4j.io",
  neo4j.auth.basic("neo4j", "f5WuJZc5uBGxWJ4AJInjgPZQD99OYd8inNQ4FyHZ6DE")
);

app.get("/api/precios", async (req, res) => {
  const canton = req.query.canton || "Zaruma"; // Puedes cambiar el valor por defecto si deseas
  const session = driver.session({ database: "neo4j" });
  try {
    const result = await session.run(
      "MATCH (c:Canton {nombre:$canton})-[:REGISTRA_PRECIO]->(precio) RETURN precio",
      { canton }
    );
    const precios = result.records.map((r) => r.get("precio").properties);
    res.json(precios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API corriendo en puerto ${port}`);
});
