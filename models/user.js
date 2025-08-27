require("dotenv").config();
const mongoose = require("mongoose");

// ✅ Database connect (without deprecated options)
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ User Schema
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true, // space hata dega
      lowercase: true, // sab chhoti letters me store hoga
    },
    fullname: {
      type: String,
      trim: true,
    },
    age: {
      type: Number,
      min: 1, // age negative ni hogi
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [
        /^\S+@\S+\.\S+$/, // email validate karega
        "Please enter a valid email address",
      ],
    },
    password: {
      type: String,
      required: true,
      minlength: 6, // password min 6 chars
    },
    image: {
      type: String,
      default: "default.png",
    },
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "post",
      },
    ],
  },
  { timestamps: true } // createdAt, updatedAt add ho jayenge
);

// ✅ Model export
module.exports = mongoose.model("User", userSchema);
