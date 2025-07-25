import { OAuth2Client } from "google-auth-library"

let client = null
let isConfigured = false

export function initializeGoogleAuth() {
  try {
    if (process.env.GOOGLE_CLIENT_ID) {
      client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
      isConfigured = true
      console.log("✅ Google OAuth client initialized successfully")
    } else {
      console.log("⚠️  Google OAuth not configured - GOOGLE_CLIENT_ID missing from environment variables")
      console.log("   To enable Google OAuth, add GOOGLE_CLIENT_ID to your backend/.env file")
    }
  } catch (error) {
    console.error("❌ Failed to initialize Google OAuth:", error.message)
    isConfigured = false
  }
}

export function isGoogleAuthConfigured() {
  return isConfigured && client !== null
}

export async function verifyGoogleToken(credential) {
  if (!isConfigured || !client) {
    throw new Error("Google OAuth is not configured")
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified,
    }
  } catch (error) {
    console.error("❌ Google token verification failed:", error.message)
    throw new Error("Invalid Google token")
  }
}
