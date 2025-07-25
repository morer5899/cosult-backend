import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import express from "express"
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper functions
const generateRandomPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 16 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)).join("")
  );
};

const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  return userObj;
};

// Controller methods
 const register = async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  try {
    // Validate required fields
    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ message: "Name, email, password, and role are required" });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
      notifications: {
        emailNotifications: true,
        appointmentReminders: true,
      },
      privacy: {
        profileVisibility: role === "consultant" ? "public" : "private",
      },
    });

    await newUser.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

 const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check for Google auth users
    if (user.isGoogleAuth) {
      return res.status(401).json({
        message:
          "This account uses Google Sign-In. Please use Google to login.",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

 const googleAuth = async (req, res) => {
  const { credential } = req.body;

  try {
    if (!credential) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
      // Create new Google-authenticated user
      const randomPassword = await bcrypt.hash(generateRandomPassword(), 10);

      user = new User({
        googleId,
        name,
        email,
        password: randomPassword,
        isGoogleAuth: true,
        avatar:
          picture || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
        notifications: {
          emailNotifications: true,
          appointmentReminders: true,
        },
        privacy: {
          profileVisibility: "public",
        },
      });

      await user.save();
    } else if (!user.googleId) {
      // Link existing account with Google
      user.googleId = googleId;
      user.isGoogleAuth = true;
      user.avatar = picture || user.avatar;
      await user.save();
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(400).json({ message: "Google authentication failed" });
  }
};

 const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists
      return res.json({
        message: "If an account exists, a reset link will be sent",
      });
    }

    // Generate reset token (expires in 1 hour)
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET + user.password,
      { expiresIn: "1h" }
    );

    // In production: Send email with reset link
    console.log(`Password reset token for ${email}:`, resetToken);

    res.json({
      message: "If an account exists, a reset link will be sent",
      // Only return token in development for testing
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

 const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token and new password are required" });
    }

    // Find user by decoding token (without verification first to get userId)
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.userId) {
      return res.status(400).json({ message: "Invalid token" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Now verify with user's current password as secret
    jwt.verify(token, process.env.JWT_SECRET + user.password);

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(400).json({ message: "Invalid or expired token" });
  }
};

const router = express.Router()

// Authentication routes
router.post("/register", register)
router.post("/login", login)
router.post("/google", googleAuth)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetPassword)

export default router