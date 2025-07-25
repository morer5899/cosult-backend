import jwt from "jsonwebtoken"
import User from "../models/User.js"

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("x-auth-token")

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Find user by ID from token
    const user = await User.findById(decoded.userId || decoded.id).select("-password")

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is not valid",
      })
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    }

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    res.status(401).json({
      success: false,
      message: "Token is not valid",
    })
  }
}

export default authMiddleware
