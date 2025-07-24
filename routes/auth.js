import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import dotenv from "dotenv"
dotenv.config();
const router = express.Router()

// Helper function to generate a random password
function generateRandomPassword(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" // Removed special characters for simplicity, can be added back
  let result = ""
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

// Test endpoint to check Google OAuth configuration
router.get("/google/test", (req, res) => {
  const config = {
    clientId: process.env.GOOGLE_CLIENT_ID ? "✓ Set" : "✗ Missing",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ? "✓ Set" : "✗ Missing",
    callbackURL: "/api/auth/google/callback",
    frontendURL: process.env.FRONTEND_URL || "http://localhost:3000",
    backendURL: process.env.BACKEND_URL || "http://localhost:5000",
  }

  res.json({
    message: "Google OAuth Configuration Check",
    config,
    instructions: "Make sure all values show '✓ Set' and URLs are correct",
  })
})

// Configure Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback", // Use relative path
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google OAuth callback received for:", profile.emails[0].value)

        let user = await User.findOne({ googleId: profile.id })
        if (user) {
          console.log("Existing Google user found:", user.email)
          // Update user's avatar if it changed (optional)
          if (user.avatar !== profile.photos[0]?.value) {
            user.avatar =
              profile.photos[0]?.value || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.emails[0].value}`
            await user.save()
          }
          return done(null, user)
        } else {
          // Check if a user with this email already exists (e.g., manual signup)
          user = await User.findOne({ email: profile.emails[0].value })
          if (user) {
            console.log("Linking existing user with Google:", user.email)
            user.googleId = profile.id
            user.isGoogleAuth = true // Mark as Google authenticated
            await user.save()
            return done(null, user)
          }

          console.log("Creating new Google user:", profile.emails[0].value)
          const randomPassword = generateRandomPassword(8) // Generate random 8-character password
          const hashedPassword = await bcrypt.hash(randomPassword, 10) // Hash the random password

          user = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            password: hashedPassword, // Store the hashed random password
            role: "client", // Default role for new Google sign-ups
            avatar:
              profile.photos[0]?.value || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.emails[0].value}`,
            isGoogleAuth: true, // Mark as Google authenticated
          })
          await user.save()
          return done(null, user)
        }
      } catch (err) {
        console.error("Google OAuth error:", err)
        return done(err, false)
      }
    },
  ),
)

// Passport serialization/deserialization
passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

// Register a new user
router.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body

  try {
    let user = await User.findOne({ email })
    if (user) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    })

    await user.save()

    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    }

    jwt.sign(payload, process.env.JWT_SECRET || "supersecretjwtkey", { expiresIn: "1h" }, (err, token) => {
      if (err) throw err
      res.status(201).json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          createdAt: user.createdAt, // Include createdAt
        },
      })
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// Login user
router.post("/login", async (req, res) => {
  const { email, password } = req.body

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    console.log(`Login attempt for email: ${email}`)

    const user = await User.findOne({ email })
    if (!user) {
      console.log(`User not found: ${email}`)
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Prevent manual password login for Google OAuth users
    // This check now relies on the 'googleId' field, which is set for all Google-authenticated users.
    if (user.googleId) {
      console.log(`User ${email} is a Google OAuth user. Please use Google Sign-In.`)
      return res.status(400).json({ message: "Please use Google Sign-In for this account" })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      console.log(`Invalid password for user: ${email}`)
      return res.status(400).json({ message: "Invalid credentials" })
    }

    const payload = {
      user: {
        id: user.id,
        role: user.role,
      },
    }

    jwt.sign(payload, process.env.JWT_SECRET || "supersecretjwtkey", { expiresIn: "1h" }, (err, token) => {
      if (err) {
        console.error("JWT signing error:", err)
        return res.status(500).json({ message: "Server error" })
      }

      console.log(`Successful login for user: ${email}`)
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          createdAt: user.createdAt, // Include createdAt
        },
      })
    })
  } catch (err) {
    console.error("Login error:", err.message)
    res.status(500).send("Server error")
  }
})

// Request password reset
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ message: "Email is required" })
  }

  try {
    const user = await User.findOne({ email })
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.json({ message: "If an account with that email exists, a password reset link has been sent." })
    }

    // In a real application, you would:
    // 1. Generate a secure reset token
    // 2. Save it to the database with expiration
    // 3. Send an email with the reset link

    // For demo purposes, we'll just return a success message
    console.log(`Password reset requested for: ${email}`)
    res.json({ message: "If an account with that email exists, a password reset link has been sent." })
  } catch (err) {
    console.error("Forgot password error:", err.message)
    res.status(500).send("Server error")
  }
})

// Google OAuth routes
router.get(
  "/google",
  (req, res, next) => {
    console.log("Google OAuth initiated")
    next()
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
)

router.get(
  "/google/callback",
  (req, res, next) => {
    console.log("Google OAuth callback received")
    next()
  },
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
    session: false,
  }),
  (req, res) => {
    console.log("Google OAuth successful for user:", req.user.email)

    // Log the FRONTEND_URL before redirecting
    console.log("FRONTEND_URL from env:", process.env.FRONTEND_URL)

    // Successful authentication, generate JWT and redirect to frontend
    const payload = {
      user: {
        id: req.user.id,
        role: req.user.role,
      },
    }

    jwt.sign(payload, process.env.JWT_SECRET || "supersecretjwtkey", { expiresIn: "1h" }, (err, token) => {
      if (err) {
        console.error("JWT generation error after Google auth:", err.message)
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=jwt_error`)
      }

      const userString = encodeURIComponent(
        JSON.stringify({
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          avatar: req.user.avatar,
          createdAt: req.user.createdAt, // Include createdAt
        }),
      )

      const redirectUrl = `${process.env.FRONTEND_URL}/dashboard?token=${token}&user=${userString}`
      console.log("Attempting to redirect to:", redirectUrl) // Log the full redirect URL
      res.redirect(redirectUrl)
    })
  },
)

export default router
