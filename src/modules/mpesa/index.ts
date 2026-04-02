import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import MpesaPaymentProcessor from "./mpesa-payment.processor"

// ─────────────────────────────────────────────
//  M-Pesa Payment Module – Medusa v2 Registration
//
//  Register in medusa-config.ts under:
//  modules: [{ resolve: "@medusajs/medusa/payment",
//    options: { providers: [{ resolve: "./src/modules/mpesa", id: "mpesa", options: {...} }] }
//  }]
// ─────────────────────────────────────────────
export default ModuleProvider(Modules.PAYMENT, {
    services: [MpesaPaymentProcessor],
})
