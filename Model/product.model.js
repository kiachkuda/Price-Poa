const { hash } = require('crypto');
const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  site: String,
  price: Number,
  discount: Number,
  image_url: String,
  url: String,
  hash_link: String,
  last_updated: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  product_hash: { type: String, unique: true },
  name: String,
  category: String,
  brand: String,
  prices: [priceSchema],
  last_updated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);