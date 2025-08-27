const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

function hashProductName(name) {
  return crypto.createHash("sha256").update(name.toLowerCase().trim()).digest("hex");
}


function parseDiscount(text) {
  if (!text) return 0; // if missing, default to 0

  // Remove non-numeric characters, keep digits and minus
  const cleaned = text.replace(/[^\d-]/g, "");

  // Parse to integer
  const discount = parseInt(cleaned, 10);

  // If parsing failed (NaN), return 0 instead
  return isNaN(discount) ? 0 : discount;
}

async function scrapeJumia(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(data);

    const products = [];

    $("article.prd").each((i, el) => {
      const name = $(el).find("h3.name").text().trim();

      let originalname = name.split(',')[0].trim();
     
      let rawPrice = $(el).find("div.prc").text().trim(); 

      // Always take the first number
      let firstPriceText = rawPrice.split('-')[0].trim(); 

      // Remove non-numeric characters except dot
      let price = firstPriceText.replace(/[^0-9.]+/g, "");
      price = parseFloat(price);
      const aTag = $(el).find("a.core");
      let discount_price = $(el).find("div.bdg").text().trim();
      
      discount_price = parseDiscount(discount_price); 

      const category = aTag.attr("data-gtm-category") || "Unknown";
      const brand = aTag.attr("data-gtm-brand") || "Unknown";
      const link =
        "https://www.jumia.co.ke" + $(el).find("a.core").attr("href");

      const cleanName = originalname.replace(/\s+/g, "").toLowerCase();

      // Generate a unique hash for the product link
      const hash_link = hashProductName(link);

      if (name && price) {
        products.push({ id:hashProductName(cleanName), name:name, price, discount_price, category, brand, link, hash_link, site: "jumia" });
      }

    });

    return products;

  } catch (error) {
    console.error("Error scraping Jumia:", error.message);
  }
}



module.exports = {
  scrapeJumia,
};