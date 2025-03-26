const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

app.use(
  cors({
    methods: ["GET", "POST", "PUT", "DELETE"],
    origin: ["https://petrotest-main.vercel.app", "http://localhost:3000"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// MongoDB Connection
mongoose.connect("mongodb+srv://admin:Admin123@cluster0.ikqiz.mongodb.net/pedro", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

// Define MongoDB Schemas
const userSchema = new mongoose.Schema({
  fname: String,
  lname: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'user' }
});

const productSchema = new mongoose.Schema({
  name: String,
  details: String,
  originalprice: Number,
  offerprice: Number,
  image: String
});

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number
});

// Create MongoDB Models
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Cart = mongoose.model('Cart', cartSchema);

// User Registration
app.post("/register", async (req, res) => {
  try {
    const { fname, lname, email, password } = req.body;

    if (!fname || !lname || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      fname,
      lname,
      email,
      password: hashedPassword
    });

    await user.save();
    res.status(201).json({ success: true, message: "Registration successful." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      "your-secret-key",
      { expiresIn: "24h" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        fname: user.fname,
        lname: user.lname,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Verify Token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  jwt.verify(token.split(" ")[1], "your-secret-key", (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, message: "Invalid token." });
    }

    req.user = decoded;
    next();
  });
};

// Verify Admin
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  next();
};

// File Upload Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Not an image! Please upload an image."), false);
  }
};

const upload = multer({ storage, fileFilter });

// Product Management
app.post("/product", upload.single("image"), async (req, res) => {
  try {
    const { name, details, originalprice, offerprice } = req.body;
    const image = req.file ? req.file.filename : null;

    const product = new Product({
      name,
      details,
      originalprice,
      offerprice,
      image
    });

    await product.save();
    res.status(201).json({ success: true, message: "Product added successfully." });
  } catch (error) {
    console.error("Product creation error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Get Products
app.get("/getproducts", async (req, res) => {
  try {
    const products = await Product.find();
    res.json({ success: true, data: products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Delete Product
app.delete("/deleteproduct/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Product deleted successfully." });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Update Product
app.put("/updateproduct/:id", upload.single("image"), verifyToken, async (req, res) => {
  try {
    const { name, details, originalprice, offerprice } = req.body;
    const image = req.file ? req.file.filename : null;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    product.name = name;
    product.details = details;
    product.originalprice = originalprice;
    product.offerprice = offerprice;
    if (image) {
      product.image = image;
    }

    await product.save();
    res.status(200).json({ success: true, message: "Product updated successfully." });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Get Product
app.get("/getproduct/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Cart Management
app.post("/addtocart", verifyToken, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.userId;

    const existingCartItem = await Cart.findOne({ userId, productId });
    if (existingCartItem) {
      existingCartItem.quantity += quantity;
      await existingCartItem.save();
    } else {
      const cartItem = new Cart({
        userId,
        productId,
        quantity
      });
      await cartItem.save();
    }

    res.status(201).json({ success: true, message: "Added to cart successfully." });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Get Cart Items
app.get("/getcart", verifyToken, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.userId }).populate('productId');
    res.json({ success: true, cart: cartItems });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Update Cart
app.put("/updatecart", verifyToken, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.userId;

    const cartItem = await Cart.findOne({ userId, productId });
    if (!cartItem) {
      return res.status(404).json({ success: false, message: "Cart item not found." });
    }

    cartItem.quantity += quantity;
    await cartItem.save();
    res.status(200).json({ success: true, message: "Cart updated successfully." });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Remove Cart Item
app.delete("/removecart/:productId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const productId = req.params.productId;

    await Cart.findOneAndDelete({ userId, productId });
    res.status(200).json({ success: true, message: "Product removed from cart." });
  } catch (error) {
    console.error("Error removing cart item:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Get Users
app.get("/getusers", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Delete User
app.delete("/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Update User
app.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const { fname, lname, email } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    user.fname = fname;
    user.lname = lname;
    user.email = email;
    await user.save();
    res.status(200).json({ success: true, message: "User updated successfully." });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
