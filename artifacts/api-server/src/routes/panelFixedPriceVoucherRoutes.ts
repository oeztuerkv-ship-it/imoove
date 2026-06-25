import { Router, type IRouter } from "express";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import { getOperationalConfigPayload, assertPlatformNewRideAllowed } from "../db/appOperationalData";
import { findCompanyById } from "../db/adminData";
import {
  fixedPriceVoucherOrderForPanelApi,
  getFixedPriceVoucherOrderForCompany,
  listFixedPriceVoucherOrdersForCompany,
} from "../db/fixedPriceVoucherOrdersData";
import {
  estimateFixedPriceVoucher,
  resolveFixedPriceVoucherOrderAfterCheckoutReturn,
  startFixedPriceVoucherCheckout,
} from "../lib/fixedPriceVoucherFulfillment";
import { validatePartnerRouteAddressPair } from "../lib/partnerRouteAddress";
import { renderFixedPriceVoucherPdf, vehicleLabelDe } from "../lib/fixedPriceVoucherPdf";
import { assertActivePanelProfile, denyUnlessPanelModule } from "./panelRouteContext";

const router: IRouter = Router();

function optCoord(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseVehicle(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "standard";
  if (v === "xl" || v === "wheelchair" || v === "standard") return v;
  if (v.includes("rollstuhl")) return "wheelchair";
  if (v.includes("xl") || v.includes("großraum")) return "xl";
  return "standard";
}

router.post("/panel/v1/fixed-price-vouchers/estimate", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;

    const body = req.body as Record<string, unknown>;
    const fromFull = String(body.fromFull ?? body.from ?? "").trim();
    const toFull = String(body.toFull ?? body.to ?? "").trim();
    if (!fromFull || !toFull) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    const addrErrEstimate = validatePartnerRouteAddressPair(fromFull, toFull);
    if (addrErrEstimate) {
      res.status(400).json(addrErrEstimate);
      return;
    }
    const distanceKm = Number(body.distanceKm ?? body.distance_km ?? 0);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }

    const opPayload = await getOperationalConfigPayload();
    const gate = assertPlatformNewRideAllowed(opPayload);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error, message: gate.message });
      return;
    }

    const result = estimateFixedPriceVoucher({
      opPayload,
      fromFull,
      toFull,
      fromLat: optCoord(body.fromLat ?? body.from_lat),
      fromLon: optCoord(body.fromLon ?? body.from_lon),
      toLat: optCoord(body.toLat ?? body.to_lat),
      toLon: optCoord(body.toLon ?? body.to_lon),
      distanceKm,
      vehicle: parseVehicle(body.vehicle),
    });

    res.json({ ok: true, estimate: result });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/fixed-price-vouchers/checkout", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.manage")) return;

    const body = req.body as Record<string, unknown>;
    const fromFull = String(body.fromFull ?? body.from ?? "").trim();
    const toFull = String(body.toFull ?? body.to ?? "").trim();
    if (!fromFull || !toFull) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    const addrErrCheckout = validatePartnerRouteAddressPair(fromFull, toFull);
    if (addrErrCheckout) {
      res.status(400).json(addrErrCheckout);
      return;
    }
    const distanceKm = Number(body.distanceKm ?? body.distance_km ?? 0);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }

    const opPayload = await getOperationalConfigPayload();
    const gate = assertPlatformNewRideAllowed(opPayload);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error, message: gate.message });
      return;
    }

    const company = await findCompanyById(ctx.claims.companyId);
    const companyName = (company?.name ?? "Partner").trim();

    const outcome = await startFixedPriceVoucherCheckout({
      opPayload,
      companyId: ctx.claims.companyId,
      panelUserId: ctx.claims.panelUserId,
      companyName,
      label: typeof body.label === "string" ? body.label : undefined,
      fromFull,
      toFull,
      fromLat: optCoord(body.fromLat ?? body.from_lat),
      fromLon: optCoord(body.fromLon ?? body.from_lon),
      toLat: optCoord(body.toLat ?? body.to_lat),
      toLon: optCoord(body.toLon ?? body.to_lon),
      distanceKm,
      vehicle: parseVehicle(body.vehicle),
    });

    if (!outcome.ok) {
      const status =
        outcome.error === "stripe_not_configured" || outcome.error === "checkout_session_failed" ? 503 : 400;
      res.status(status).json({ ok: false, error: outcome.error, message: outcome.message });
      return;
    }

    res.json({ ok: true, checkoutUrl: outcome.checkoutUrl, orderId: outcome.orderId });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fixed-price-vouchers/orders", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;

    const orders = await listFixedPriceVoucherOrdersForCompany(ctx.claims.companyId);
    res.json({ ok: true, orders: orders.map(fixedPriceVoucherOrderForPanelApi) });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fixed-price-vouchers/orders/by-session/:sessionId", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;

    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "session_id_required" });
      return;
    }

    const order = await resolveFixedPriceVoucherOrderAfterCheckoutReturn(ctx.claims.companyId, sessionId);
    if (!order) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, order: fixedPriceVoucherOrderForPanelApi(order) });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fixed-price-vouchers/orders/:orderId", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;

    const orderId = String(req.params.orderId ?? "").trim();
    const order = await getFixedPriceVoucherOrderForCompany(ctx.claims.companyId, orderId);
    if (!order) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, order: fixedPriceVoucherOrderForPanelApi(order) });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/fixed-price-vouchers/orders/:orderId/pdf", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;

    const orderId = String(req.params.orderId ?? "").trim();
    const order = await getFixedPriceVoucherOrderForCompany(ctx.claims.companyId, orderId);
    if (!order || order.status !== "paid" || !order.codePlain) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const company = await findCompanyById(ctx.claims.companyId);
    const companyName = (company?.name ?? "Partner").trim();
    const pdf = await renderFixedPriceVoucherPdf({
      codePlain: order.codePlain,
      label: order.label,
      companyName,
      fromFull: order.fromFull,
      toFull: order.toFull,
      distanceKm: order.distanceKm,
      vehicleLabel: vehicleLabelDe(order.vehicle),
      priceEur: order.priceEur,
      basePriceEur: order.basePriceEur,
      vehicleSurchargeEur: order.vehicleSurchargeEur,
      paidAtIso: order.paidAt ?? order.createdAt,
    });

    const safeName = order.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="onroda-festpreis-gutschein-${safeName}.pdf"`);
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

export default router;
