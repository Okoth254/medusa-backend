import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const port = process.env.PORT ? parseInt(process.env.PORT) : 7860

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/mpesa",
            id: "mpesa",
            options: {
              consumerKey: process.env.MPESA_CONSUMER_KEY,
              consumerSecret: process.env.MPESA_CONSUMER_SECRET,
              passkey: process.env.MPESA_PASSKEY,
              shortcode: process.env.MPESA_SHORTCODE,
              callbackBaseUrl: process.env.MPESA_CALLBACK_BASE_URL,
              environment: process.env.MPESA_ENV || "sandbox"
            }
          }
        ]
      }
    }
  ]
})
