const mongoose = require("mongoose");
const { pipeline } = require("@xenova/transformers");

const { scrapeJumia } = require("./scraper.js");
const Product = require("./Model/product.model.js");

const MONGO_URI = "mongodb://localhost:27017/jumia_scraper";

// ----------------------
// Connect to DB
// ----------------------
async function connectDB() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

// ----------------------
// Helper Functions
// ----------------------
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\-_,.]+/g, " ") // replace punctuation with space
    .replace(/\b(smartphone|mobile|phone|inch|gb)\b/g, "") // remove stopwords
    .replace(/\s+/g, " ") // remove extra spaces
    .trim();
}

function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((acc, v, i) => acc + v * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((acc, v) => acc + v * v, 0));
  const normB = Math.sqrt(vecB.reduce((acc, v) => acc + v * v, 0));
  return dot / (normA * normB);
}

// ----------------------
// Group Products by Cosine Similarity
// ----------------------
async function groupProductsBySimilarity(products, embedder, threshold = 0.75) {
  const productsWithEmbeddings = [];

  for (const product of products) {
    const normalizedName = normalizeName(product.name);
    const embedding = await embedder(normalizedName, {
      pooling: "mean",
      normalize: true,
    });
    productsWithEmbeddings.push({
      ...product,
      normalizedName,
      embedding: embedding.data,
    });
  }

  const groups = [];

  for (const product of productsWithEmbeddings) {
    let added = false;
    for (const group of groups) {
      if (cosineSimilarity(product.embedding, group[0].embedding) >= threshold) {
        group.push(product);
        added = true;
        break;
      }
    }
    if (!added) groups.push([product]);
  }

  return groups;
}

// ----------------------
// Save/Update in MongoDB
// ----------------------
async function saveGroupsToDB(groups) {
  for (const group of groups) {
    const groupId = group[0].normalizedName;

    let existingProduct = await Product.findOne({ product_hash: groupId });

    if (!existingProduct) {
      const newProduct = new Product({
        product_hash: groupId,
        name: group[0].name,
        category: group[0].category,
        brand: group[0].brand,
        prices: group.map((p) => ({
          site: p.site,
          price: p.price,
          url: p.link,
          hash_link: p.hash_link,
          discount: p.discount_price
           
        })),
      });
      await newProduct.save();
      console.log(`✅ Saved new grouped product: ${group[0].name}`);
    } else {
      for (const p of group) {
        if (!existingProduct.prices.some((pr) => pr.hash_link === p.hash_link)) {
          existingProduct.prices.push({
            site: p.site,
            price: p.price,
            url: p.link,
            hash_link: p.hash_link,
            discount: p.discount_price
              
          });
        }
      }
      await existingProduct.save();
      console.log(`🔄 Updated grouped product: ${existingProduct.name}`);
    }
  }
}

// ----------------------
// Scrape multiple pages
// ----------------------
async function scrapeAllPages(baseUrl, maxPages = 7) {
  let allProducts = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl}?page=${page}#catalog-listing`;
    console.log(`🔎 Scraping page ${page}: ${url}`);
    const products = await scrapeJumia(url);

    if (!products || products.length === 0) {
      console.log(`⚠️ No products found on page ${page}, stopping.`);
      break;
    }

    allProducts = [...allProducts, ...products];
  }

  return allProducts;
}

// ----------------------
// Main Function
// ----------------------
async function main() {
  await connectDB();

  const baseUrl = "https://www.jumia.co.ke/phones-tablets/";
  const allProducts = await scrapeAllPages(baseUrl, 7);

  if (allProducts.length === 0) {
    console.log("❌ No products scraped. Exiting.");
    mongoose.connection.close();
    return;
  }

  // Load local embedding model
  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  console.log("✅ Embedding model loaded");

  // Group products
  const groups = await groupProductsBySimilarity(allProducts, embedder, 0.75);

  // Save to MongoDB
  await saveGroupsToDB(groups);

  console.log("🎉 Scraping, grouping, and saving completed.");
  mongoose.connection.close();
}

main().catch((err) => {
  console.error("❌ Error in main:", err);
  mongoose.connection.close();
});
