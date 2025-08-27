// server.js (ya jisme tu server chala raha hai)
const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();

const userModel = require("./models/user");
const postModel = require("./models/post");
const upload = require("./utils/multer");

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret"; // .env me set kar: JWT_SECRET=yourSecret

// ---------- VIEW & MIDDLEWARE ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// optional: basic request logger
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ---------- HELPERS ----------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: false, // production me true + behind HTTPS
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// ---------- AUTH MIDDLEWARE ----------
function isLoggedIn(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.redirect("/login");
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.redirect("/login");
    req.user = decoded; // { email, iat, exp }
    next();
  });
}

// ---------- ROUTES ----------

// Register page
app.get("/", (req, res) => {
  res.render("register", { errorMessage: null });
});

// Login page (single route only)
app.get("/login", (req, res) => {
  res.render("login", { errorMessage: null });
});

// Register action
app.post("/register", async (req, res) => {
  try {
    const { username, fullname, age, email, password } = req.body;

    // basic validation
    if (!username || !fullname || !email || !password) {
      return res.status(400).render("register", {
        errorMessage: "Please fill all required fields",
      });
    }

    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .render("register", { errorMessage: "Email already exists!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await userModel.create({
      username,
      fullname,
      age,
      email,
      password: hash,
    });

    const token = signToken({ email });
    setAuthCookie(res, token);
    return res.redirect("/profile");
  } catch (err) {
    console.error("Register error:", err);
    return res
      .status(500)
      .render("register", { errorMessage: "Something went wrong" });
  }
});

// Login action
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).render("login", {
        errorMessage: "Username or Password was incorrect",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).render("login", {
        errorMessage: "Username or Password was incorrect",
      });
    }

    const token = signToken({ email });
    setAuthCookie(res, token);
    return res.redirect("/profile");
  } catch (err) {
    console.error("Login error:", err);
    return res
      .status(500)
      .render("login", { errorMessage: "Something went wrong" });
  }
});

// Profile (private)
app.get("/profile", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel
      .findOne({ email: req.user.email })
      .populate("posts");
    if (!user) return res.redirect("/login");
    return res.render("profile", { user });
  } catch (err) {
    console.error("Profile error:", err);
    return res.redirect("/login");
  }
});

// Create Post (private)
app.post("/post", isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    if (!user) return res.redirect("/login");

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.redirect("/profile");
    }

    const post = await postModel.create({
      user: user._id,
      content: content.trim(),
    });

    user.posts.push(post._id);
    await user.save();

    return res.redirect("/profile");
  } catch (err) {
    console.error("Create post error:", err);
    return res.redirect("/profile");
  }
});

// Delete Post (private + ownership check)
app.get("/delete/:id", isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id).populate("user");
    const user = await userModel.findOne({ email: req.user.email });
    if (!post || !user || String(post.user._id) !== String(user._id)) {
      return res.redirect("/profile");
    }
    await postModel.findByIdAndDelete(req.params.id);
    return res.redirect("/profile");
  } catch (err) {
    console.error("Delete post error:", err);
    return res.redirect("/profile");
  }
});

// Edit page (private + ownership check)
app.get("/edit/:id", isLoggedIn, async (req, res) => {
  try {
    const post = await postModel.findById(req.params.id);
    const user = await userModel.findOne({ email: req.user.email });
    if (!post || !user || String(post.user) !== String(user._id)) {
      return res.redirect("/profile");
    }
    return res.render("post", { post, user });
  } catch (err) {
    console.error("Edit page error:", err);
    return res.redirect("/profile");
  }
});

// Edit submit (private + ownership check)
app.post("/edit/:id", isLoggedIn, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await postModel.findById(req.params.id);
    const user = await userModel.findOne({ email: req.user.email });
    if (!post || !user || String(post.user) !== String(user._id)) {
      return res.redirect("/profile");
    }
    await postModel.findByIdAndUpdate(req.params.id, {
      content: content?.trim() || "",
    });
    return res.redirect("/profile");
  } catch (err) {
    console.error("Edit submit error:", err);
    return res.redirect("/profile");
  }
});

// Logout
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  return res.redirect("/login");
});

// Profile update page
app.get("/profile/update/:id", isLoggedIn, async (req, res) => {
  try {
    const me = await userModel.findOne({ email: req.user.email });
    if (!me || String(me._id) !== String(req.params.id)) {
      return res.redirect("/profile");
    }
    return res.render("updateProfile", { user: me });
  } catch (err) {
    console.error("Update page error:", err);
    return res.redirect("/profile");
  }
});

// Profile update submit (with multer)
app.post(
  "/profile/update/:id",
  isLoggedIn,
  upload.single("image"),
  async (req, res) => {
    try {
      const me = await userModel.findOne({ email: req.user.email });
      if (!me || String(me._id) !== String(req.params.id)) {
        return res.redirect("/profile");
      }

      const { fullname } = req.body;
      if (fullname) me.fullname = fullname;

      if (req.file) {
        me.image = req.file.filename;
      }

      await me.save();
      return res.redirect("/profile");
    } catch (err) {
      console.error("Update submit error:", err);
      return res.redirect("/profile");
    }
  }
);

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
