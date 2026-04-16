import { Platform } from "react-native";

export interface ReceiptData {
  rideId: string;
  date: string;
  time: string;
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
  vehicle: string;
  paymentMethod: string;
  totalFare: number;
  driverName?: string;
}

function formatEuroHtml(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}

function buildReceiptHtml(data: ReceiptData): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Quittung #${data.rideId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #f5f5f5;
    color: #111;
    padding: 32px 16px;
    min-height: 100vh;
  }
  .receipt {
    max-width: 480px;
    margin: 0 auto;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 20px rgba(0,0,0,0.10);
    overflow: hidden;
  }
  .header {
    background: #DC2626;
    color: #fff;
    padding: 28px 28px 20px;
    text-align: center;
  }
  .logo { font-size: 26px; font-weight: 900; letter-spacing: 1.2px; margin-bottom: 4px; }
  .receipt-title { font-size: 13px; font-weight: 500; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
  .receipt-id { font-size: 12px; opacity: 0.75; margin-top: 4px; }

  .body { padding: 24px 28px; }
  .date-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .date-label { font-size: 12px; color: #888; font-weight: 500; }
  .date-value { font-size: 13px; color: #333; font-weight: 600; }

  .route-section { background: #f9f9f9; border-radius: 12px; padding: 16px; margin-bottom: 18px; }
  .route-label { font-size: 10px; color: #888; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
  .route-row { display: flex; align-items: flex-start; gap: 12px; }
  .route-dots { display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 3px; }
  .dot-filled { width: 10px; height: 10px; border-radius: 50%; background: #22C55E; }
  .dot-line { width: 2px; height: 18px; background: #ddd; }
  .dot-red { width: 10px; height: 10px; border-radius: 50%; background: #DC2626; }
  .route-labels { flex: 1; gap: 16px; display: flex; flex-direction: column; }
  .route-point { font-size: 13px; color: #111; font-weight: 500; }
  .route-sublabel { font-size: 11px; color: #888; margin-bottom: 8px; }

  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .stat-box { background: #f9f9f9; border-radius: 10px; padding: 12px; text-align: center; }
  .stat-val { font-size: 16px; font-weight: 700; color: #111; }
  .stat-lbl { font-size: 11px; color: #888; margin-top: 3px; }

  .payment-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #f0f0f0;
    padding-top: 16px;
    margin-top: 4px;
    margin-bottom: 10px;
  }
  .payment-label { font-size: 12px; color: #888; font-weight: 500; }
  .payment-value { font-size: 13px; color: #333; font-weight: 600; }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #DC2626;
    border-radius: 12px;
    padding: 16px 18px;
    margin-top: 12px;
  }
  .total-label { font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 600; }
  .total-amount { font-size: 26px; font-weight: 800; color: #fff; }

  .footer {
    text-align: center;
    padding: 18px 28px;
    background: #fafafa;
    border-top: 1px solid #f0f0f0;
    font-size: 11px;
    color: #aaa;
    line-height: 1.6;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .receipt { box-shadow: none; border-radius: 0; }
    .print-btn { display: none !important; }
  }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="logo">ONRODA</div>
    <div class="receipt-title">Fahrtquittung</div>
    <div class="receipt-id">Nr. ${data.rideId}</div>
  </div>

  <div class="body">
    <div class="date-row">
      <div>
        <div class="date-label">Datum</div>
        <div class="date-value">${data.date}</div>
      </div>
      <div style="text-align:right">
        <div class="date-label">Uhrzeit</div>
        <div class="date-value">${data.time} Uhr</div>
      </div>
    </div>

    <div class="route-section">
      <div class="route-label">Route</div>
      <div class="route-row">
        <div class="route-dots">
          <div class="dot-filled"></div>
          <div class="dot-line"></div>
          <div class="dot-red"></div>
        </div>
        <div class="route-labels">
          <div>
            <div class="route-sublabel">Abfahrt</div>
            <div class="route-point">${data.origin}</div>
          </div>
          <div>
            <div class="route-sublabel">Ziel</div>
            <div class="route-point">${data.destination}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat-box">
        <div class="stat-val">${data.distanceKm.toFixed(1)} km</div>
        <div class="stat-lbl">Strecke</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">~${data.durationMinutes} Min</div>
        <div class="stat-lbl">Fahrtdauer</div>
      </div>
    </div>

    <div class="payment-row">
      <span class="payment-label">Zahlungsart</span>
      <span class="payment-value">${data.paymentMethod}</span>
    </div>

    <div class="payment-row" style="border-top:none; padding-top:0; margin-bottom:0;">
      <span class="payment-label">Fahrzeug</span>
      <span class="payment-value">${data.vehicle}</span>
    </div>

    <div class="total-row">
      <span class="total-label">Gesamtbetrag</span>
      <span class="total-amount">${formatEuroHtml(data.totalFare)}</span>
    </div>
  </div>

  <div class="footer">
    ONRODA · Deutschland<br/>
    Vielen Dank für Ihre Fahrt!<br/>
    Diese Quittung gilt als steuerlicher Beleg.
  </div>
</div>

<script>
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 400);
  });
<\/script>
</body>
</html>`;
}

export async function downloadReceipt(data: ReceiptData): Promise<void> {
  const html = buildReceiptHtml(data);

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quittung-${data.rideId}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      console.warn("Download nicht möglich.");
    }
    return;
  }

  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html });
  } catch {
    console.warn("Drucken nicht verfügbar.");
  }
}
