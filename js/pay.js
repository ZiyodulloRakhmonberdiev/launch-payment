const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbymcTgrXfoQsy_9xP1DwfyvS-j5CyEoA_eh4bzwBrQwk_zpTB71bqFeWtKQWWo4EK5JRQ/exec";

// Lead "Royhatdan otganlar" varag'iga faqat index sahifasida (app.js) yuboriladi —
// bu sahifada qayta yuborilmaydi, aks holda dublikat tushadi.

const localData = JSON.parse(localStorage.getItem("formData") || "{}");

// ===== 1) Bitta joyda tarif + narxlar (UZS) =====
const TARIFFS = {
  booking: { label: "Ro'yxatdan o'tish", uzs: 100_000 },
  standart: { label: "Standart", uzs: 4_450_000 },
  premium: { label: "Premium", uzs: 4_950_000 },
  vip: { label: "VIP", uzs: 13_500_000 },
};

// type normalize: "Premium" -> "premium", default -> "vip"
const typeKey = String(localData.type || "vip").trim().toLowerCase();
const selectedTariff = TARIFFS[typeKey] ?? TARIFFS.vip;

// ===== 2) DOM helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const formatUZS = (n) =>
  new Intl.NumberFormat("ru-RU").format(Number(n || 0)).replace(/,/g, " ") + " so'm";

const formatUSD = (n) => `$${Number(n || 0).toFixed(2)}`;

// ===== 3) Elements =====
const paymentTariffEl = $(".payment__tariff");
const pricesAllEls = $$(".pricesAll");
const priceUSDEl = $(".priceUSD");

// (ixtiyoriy) band qilish uchun joy bo’lsa:
const bookingUZSEl = $(".bookingPriceUZS");
const bookingUSDEl = $(".bookingPriceUSD");

// ===== 4) UZS ni chiqarish =====
if (paymentTariffEl) {
  paymentTariffEl.innerHTML = `Tarif: ${selectedTariff.label}`;
}

pricesAllEls.forEach((el) => {
  el.innerHTML = formatUZS(selectedTariff.uzs);
});

// band qilishni ham ko’rsatmoqchi bo’lsang:
if (bookingUZSEl) bookingUZSEl.innerHTML = formatUZS(TARIFFS.booking.uzs);

// ===== 5) USD conversion (cache bilan) =====
(async () => {
  const rate = await getUZSToUSDRate(); // 1 UZS -> USD
  if (!rate) return;

  const usd = selectedTariff.uzs * rate;

  if (priceUSDEl) priceUSDEl.innerHTML = formatUSD(usd);

  // band qilish USD:
  if (bookingUSDEl) bookingUSDEl.innerHTML = formatUSD(TARIFFS.booking.uzs * rate);
})();

async function getUZSToUSDRate() {
  // 30 minut cache (xohlasang 1 soat qil)
  const CACHE_KEY = "uzs_usd_rate_cache_v1";
  const TTL_MS = 30 * 60 * 1000;

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rate, ts } = JSON.parse(cached);
      if (rate && ts && Date.now() - ts < TTL_MS) return rate;
    }

    const res = await fetch(
      "https://v6.exchangerate-api.com/v6/d724f66af3d5a151bdcd1d40/latest/UZS"
    );
    const data = await res.json();

    const rate = data?.conversion_rates?.USD;
    if (!rate) return null;

    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
    return rate;
  } catch (e) {
    console.error("Valyuta kursini olishda xatolik:", e);
    return null;
  }
}


document
  .getElementById("paymentForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const submitButton = this.querySelector(".payment__btn");
    submitButton.disabled = true;
    submitButton.textContent = "Yuborilmoqda...";

    try {
      const localData = JSON.parse(localStorage.getItem("formData") || "{}");

      if (!localData.name || !localData.phone_number) {
        alert(
          "Ism yoki telefon raqami topilmadi. Iltimos, formani to‘ldiring.",
        );
        submitButton.disabled = false;
        submitButton.textContent = "Davom etish";
        return;
      }

      const form = new FormData(this);
      const paymentType = form.get("status") || "";
      const file = form.get("chek");

      if (!file || file.size === 0) {
        alert("Chek rasmini yuklang");
        submitButton.disabled = false;
        submitButton.textContent = "Davom etish";
        return;
      }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("Fayl hajmi 10MB dan kichik bo‘lishi kerak");
        submitButton.disabled = false;
        submitButton.textContent = "Davom etish";
        return;
      }

      const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        alert("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");
        submitButton.disabled = false;
        submitButton.textContent = "Davom etish";
        return;
      }

      // update localStorage meta
      const updatedLocalData = {
        ...localData,
        payment_type: String(paymentType),
        file_name: file.name,
        last_submitted: new Date().toISOString(),
      };
      localStorage.setItem("formData", JSON.stringify(updatedLocalData));

      // convert file to base64 (DataURL) and strip prefix
      const toBase64 = (f) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result; // data:<mime>;base64,<data>
            const commaIndex = result.indexOf(",");
            const b64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
            resolve({ b64, mime: f.type });
          };
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(f);
        });

      const { b64, mime } = await toBase64(file);

      // sana / vaqt — "Chek Yuborganlar" varog'idagi ustun nomlariga mos
      // Format: kun.oy.yil
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const sana = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
      const vaqt = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
        now.getSeconds(),
      )}`;

      // Build the payload the server expects (base64 approach)
      // "Chek Yuborganlar" ustunlari: Ism | Telefon raqam | Tarif | Offerta | Check URL | sana | vaqt
      const payload = {
        sheetName: "Chek Yuborganlar", // Google Sheets varaq nomi
        imageUpload: true,
        checkUrlHeader: "Check URL",
        Ism: localData.name.toString(),
        "Telefon raqam": localData.phone_number.toString(),
        Tarif: localData.type || "",
        Offerta: localData.offerta,
        file_data: b64,
        file_filename: file.name,
        file_mime: mime,
        sana: sana,
        vaqt: vaqt,
      };

      // Save pending submission (stringified) — used by thankYou page
      // Yuborish FAQAT thankYou.js da bo'ladi — bu yerda ham yuborilsa dublikat tushadi
      localStorage.setItem("pendingSubmission", JSON.stringify(payload));

      // Reset the form UI immediately and redirect to thank you page
      this.reset();
      document.querySelector(".uploadCheck").innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">
<g>
<path d="M 3.86 63.09 C1.51,61.19 1.50,61.08 1.17,35.84 C0.80,8.16 1.33,4.08 5.54,2.16 C7.05,1.47 13.26,1.00 20.80,1.00 L 33.52 1.00 L 43.26 10.29 L 53.00 19.59 L 53.00 40.29 C53.00,59.67 52.87,61.13 51.00,63.00 C49.12,64.88 47.67,65.00 27.61,65.00 C8.05,65.00 6.02,64.84 3.86,63.09 ZM 49.96 60.07 C50.57,58.94 51.00,50.61 51.00,40.07 L 51.00 22.00 L 43.65 22.00 C33.94,22.00 32.65,20.71 32.65,10.98 L 32.65 4.00 L 19.36 4.00 C7.24,4.00 5.98,4.17 5.04,5.93 C3.49,8.82 3.64,59.24 5.20,60.80 C6.06,61.66 12.46,62.00 27.66,62.00 C47.67,62.00 48.99,61.88 49.96,60.07 ZM 41.70 12.22 L 35.00 5.52 L 35.00 11.14 C35.00,14.47 35.52,17.19 36.28,17.81 C37.43,18.77 46.86,19.90 47.95,19.21 C48.20,19.06 45.39,15.91 41.70,12.22 ZM 14.00 50.92 C14.00,48.08 14.38,46.97 15.25,47.27 C15.94,47.51 16.46,48.67 16.42,49.85 C16.34,51.92 16.73,52.00 27.17,52.00 L 38.00 52.00 L 38.00 49.50 C38.00,47.94 38.57,47.00 39.50,47.00 C40.58,47.00 41.00,48.11 41.00,51.00 L 41.00 55.00 L 27.50 55.00 L 14.00 55.00 L 14.00 50.92 ZM 26.00 37.83 L 26.00 31.65 L 23.68 33.83 C19.73,37.54 19.73,34.86 23.68,30.81 L 27.41 27.00 L 31.16 30.66 C35.19,34.59 35.40,37.67 31.39,33.90 L 29.00 31.65 L 29.00 37.83 C29.00,42.65 28.67,44.00 27.50,44.00 C26.33,44.00 26.00,42.65 26.00,37.83 Z" fill="rgba(0,0,0,1)"/>
</g>
</svg>
        Chek rasmini yuklash uchun bu yerga bosing
      `;
      submitButton.disabled = false;
      submitButton.textContent = "Davom etish";

      // Redirect right away — thankYou page will take over sending in background
      window.location.href = "/thankYou.html";
    } catch (err) {
      console.error("Submit error:", err);
      alert(
        `Xato yuz berdi: ${
          err.message || err
        }. Iltimos, keyinroq qayta urinib ko‘ring.`,
      );
      const submitButton = document.querySelector(".payment__btn");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Davom etish";
      }
    }
  });

// Update upload label when file selected
document.getElementById("chek").addEventListener("change", function () {
  const file = this.files[0];
  const uploadLabel = document.querySelector(".uploadCheck");

  if (file) {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Fayl hajmi 10MB dan kichik bo‘lishi kerak");
      this.value = "";
      uploadLabel.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">
<g>
<path d="M 3.86 63.09 C1.51,61.19 1.50,61.08 1.17,35.84 C0.80,8.16 1.33,4.08 5.54,2.16 C7.05,1.47 13.26,1.00 20.80,1.00 L 33.52 1.00 L 43.26 10.29 L 53.00 19.59 L 53.00 40.29 C53.00,59.67 52.87,61.13 51.00,63.00 C49.12,64.88 47.67,65.00 27.61,65.00 C8.05,65.00 6.02,64.84 3.86,63.09 ZM 49.96 60.07 C50.57,58.94 51.00,50.61 51.00,40.07 L 51.00 22.00 L 43.65 22.00 C33.94,22.00 32.65,20.71 32.65,10.98 L 32.65 4.00 L 19.36 4.00 C7.24,4.00 5.98,4.17 5.04,5.93 C3.49,8.82 3.64,59.24 5.20,60.80 C6.06,61.66 12.46,62.00 27.66,62.00 C47.67,62.00 48.99,61.88 49.96,60.07 ZM 41.70 12.22 L 35.00 5.52 L 35.00 11.14 C35.00,14.47 35.52,17.19 36.28,17.81 C37.43,18.77 46.86,19.90 47.95,19.21 C48.20,19.06 45.39,15.91 41.70,12.22 ZM 14.00 50.92 C14.00,48.08 14.38,46.97 15.25,47.27 C15.94,47.51 16.46,48.67 16.42,49.85 C16.34,51.92 16.73,52.00 27.17,52.00 L 38.00 52.00 L 38.00 49.50 C38.00,47.94 38.57,47.00 39.50,47.00 C40.58,47.00 41.00,48.11 41.00,51.00 L 41.00 55.00 L 27.50 55.00 L 14.00 55.00 L 14.00 50.92 ZM 26.00 37.83 L 26.00 31.65 L 23.68 33.83 C19.73,37.54 19.73,34.86 23.68,30.81 L 27.41 27.00 L 31.16 30.66 C35.19,34.59 35.40,37.67 31.39,33.90 L 29.00 31.65 L 29.00 37.83 C29.00,42.65 28.67,44.00 27.50,44.00 C26.33,44.00 26.00,42.65 26.00,37.83 Z" fill="rgba(0,0,0,1)"/>
</g>
</svg>
        Chek rasmini yuklash uchun bu yerga bosing
      `;
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      alert("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");
      this.value = "";
      uploadLabel.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">
<g>
<path d="M 3.86 63.09 C1.51,61.19 1.50,61.08 1.17,35.84 C0.80,8.16 1.33,4.08 5.54,2.16 C7.05,1.47 13.26,1.00 20.80,1.00 L 33.52 1.00 L 43.26 10.29 L 53.00 19.59 L 53.00 40.29 C53.00,59.67 52.87,61.13 51.00,63.00 C49.12,64.88 47.67,65.00 27.61,65.00 C8.05,65.00 6.02,64.84 3.86,63.09 ZM 49.96 60.07 C50.57,58.94 51.00,50.61 51.00,40.07 L 51.00 22.00 L 43.65 22.00 C33.94,22.00 32.65,20.71 32.65,10.98 L 32.65 4.00 L 19.36 4.00 C7.24,4.00 5.98,4.17 5.04,5.93 C3.49,8.82 3.64,59.24 5.20,60.80 C6.06,61.66 12.46,62.00 27.66,62.00 C47.67,62.00 48.99,61.88 49.96,60.07 ZM 41.70 12.22 L 35.00 5.52 L 35.00 11.14 C35.00,14.47 35.52,17.19 36.28,17.81 C37.43,18.77 46.86,19.90 47.95,19.21 C48.20,19.06 45.39,15.91 41.70,12.22 ZM 14.00 50.92 C14.00,48.08 14.38,46.97 15.25,47.27 C15.94,47.51 16.46,48.67 16.42,49.85 C16.34,51.92 16.73,52.00 27.17,52.00 L 38.00 52.00 L 38.00 49.50 C38.00,47.94 38.57,47.00 39.50,47.00 C40.58,47.00 41.00,48.11 41.00,51.00 L 41.00 55.00 L 27.50 55.00 L 14.00 55.00 L 14.00 50.92 ZM 26.00 37.83 L 26.00 31.65 L 23.68 33.83 C19.73,37.54 19.73,34.86 23.68,30.81 L 27.41 27.00 L 31.16 30.66 C35.19,34.59 35.40,37.67 31.39,33.90 L 29.00 31.65 L 29.00 37.83 C29.00,42.65 28.67,44.00 27.50,44.00 C26.33,44.00 26.00,42.65 26.00,37.83 Z" fill="rgba(0,0,0,1)"/>
</g>
</svg>
        Chek rasmini yuklash uchun bu yerga bosing
      `;
      return;
    }

    uploadLabel.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">
<g>
<path d="M 3.86 63.09 C1.51,61.19 1.50,61.08 1.17,35.84 C0.80,8.16 1.33,4.08 5.54,2.16 C7.05,1.47 13.26,1.00 20.80,1.00 L 33.52 1.00 L 43.26 10.29 L 53.00 19.59 L 53.00 40.29 C53.00,59.67 52.87,61.13 51.00,63.00 C49.12,64.88 47.67,65.00 27.61,65.00 C8.05,65.00 6.02,64.84 3.86,63.09 ZM 49.96 60.07 C50.57,58.94 51.00,50.61 51.00,40.07 L 51.00 22.00 L 43.65 22.00 C33.94,22.00 32.65,20.71 32.65,10.98 L 32.65 4.00 L 19.36 4.00 C7.24,4.00 5.98,4.17 5.04,5.93 C3.49,8.82 3.64,59.24 5.20,60.80 C6.06,61.66 12.46,62.00 27.66,62.00 C47.67,62.00 48.99,61.88 49.96,60.07 ZM 41.70 12.22 L 35.00 5.52 L 35.00 11.14 C35.00,14.47 35.52,17.19 36.28,17.81 C37.43,18.77 46.86,19.90 47.95,19.21 C48.20,19.06 45.39,15.91 41.70,12.22 ZM 14.00 50.92 C14.00,48.08 14.38,46.97 15.25,47.27 C15.94,47.51 16.46,48.67 16.42,49.85 C16.34,51.92 16.73,52.00 27.17,52.00 L 38.00 52.00 L 38.00 49.50 C38.00,47.94 38.57,47.00 39.50,47.00 C40.58,47.00 41.00,48.11 41.00,51.00 L 41.00 55.00 L 27.50 55.00 L 14.00 55.00 L 14.00 50.92 ZM 26.00 37.83 L 26.00 31.65 L 23.68 33.83 C19.73,37.54 19.73,34.86 23.68,30.81 L 27.41 27.00 L 31.16 30.66 C35.19,34.59 35.40,37.67 31.39,33.90 L 29.00 31.65 L 29.00 37.83 C29.00,42.65 28.67,44.00 27.50,44.00 C26.33,44.00 26.00,42.65 26.00,37.83 Z" fill="rgba(0,0,0,1)"/>
</g>
</svg>
      ${file.name}
    `;
  } else {
    uploadLabel.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="54" height="66" viewBox="0 0 54 66">
<g>
<path d="M 3.86 63.09 C1.51,61.19 1.50,61.08 1.17,35.84 C0.80,8.16 1.33,4.08 5.54,2.16 C7.05,1.47 13.26,1.00 20.80,1.00 L 33.52 1.00 L 43.26 10.29 L 53.00 19.59 L 53.00 40.29 C53.00,59.67 52.87,61.13 51.00,63.00 C49.12,64.88 47.67,65.00 27.61,65.00 C8.05,65.00 6.02,64.84 3.86,63.09 ZM 49.96 60.07 C50.57,58.94 51.00,50.61 51.00,40.07 L 51.00 22.00 L 43.65 22.00 C33.94,22.00 32.65,20.71 32.65,10.98 L 32.65 4.00 L 19.36 4.00 C7.24,4.00 5.98,4.17 5.04,5.93 C3.49,8.82 3.64,59.24 5.20,60.80 C6.06,61.66 12.46,62.00 27.66,62.00 C47.67,62.00 48.99,61.88 49.96,60.07 ZM 41.70 12.22 L 35.00 5.52 L 35.00 11.14 C35.00,14.47 35.52,17.19 36.28,17.81 C37.43,18.77 46.86,19.90 47.95,19.21 C48.20,19.06 45.39,15.91 41.70,12.22 ZM 14.00 50.92 C14.00,48.08 14.38,46.97 15.25,47.27 C15.94,47.51 16.46,48.67 16.42,49.85 C16.34,51.92 16.73,52.00 27.17,52.00 L 38.00 52.00 L 38.00 49.50 C38.00,47.94 38.57,47.00 39.50,47.00 C40.58,47.00 41.00,48.11 41.00,51.00 L 41.00 55.00 L 27.50 55.00 L 14.00 55.00 L 14.00 50.92 ZM 26.00 37.83 L 26.00 31.65 L 23.68 33.83 C19.73,37.54 19.73,34.86 23.68,30.81 L 27.41 27.00 L 31.16 30.66 C35.19,34.59 35.40,37.67 31.39,33.90 L 29.00 31.65 L 29.00 37.83 C29.00,42.65 28.67,44.00 27.50,44.00 C26.33,44.00 26.00,42.65 26.00,37.83 Z" fill="rgba(0,0,0,1)"/>
</g>
</svg>
      Chek rasmini yuklash uchun bu yerga bosing
    `;
  }
});

let timerElement = document.getElementById("timer");

// Start value: 20:00
let minutes = 20;
let seconds = 0;

function updateTimer() {
  if (seconds === 0) {
    if (minutes === 0) {
      clearInterval(timerInterval);
      timerElement.innerText = "00:00";
      // Timer tugaganda nima bo'lishi kerak — shu yerga yoz
      return;
    }
    minutes--;
    seconds = 59;
  } else {
    seconds--;
  }

  let minStr = minutes < 10 ? "0" + minutes : minutes;
  let secStr = seconds < 10 ? "0" + seconds : seconds;
  timerElement.innerText = `${minStr}:${secStr}`;
}

let timerInterval = setInterval(updateTimer, 1000);

document.querySelectorAll(".copy").forEach((btn) => {
  // Store the original SVG
  const originalSVG = btn.innerHTML;

  // Define the tick SVG
  const tickSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2F80EC" class="size-8">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  `;

  btn.addEventListener("click", () => {
    // Find the card number from the closest .payment__card element
    const cardNumber = btn
      .closest(".payment__card")
      .querySelector(".payment__card-number")
      .textContent.trim();

    // Copy to clipboard
    navigator.clipboard
      .writeText(cardNumber)
      .then(() => {
        // Show success message

        // Change to tick SVG
        btn.innerHTML = tickSVG;

        // Revert to original SVG after 1.5 seconds
        setTimeout(() => {
          btn.innerHTML = originalSVG;
        }, 1500);
      })
      .catch((err) => {
        // Show error message
        alert("Nusxalashda xatolik yuz berdi!");
        console.error(err);
      });
  });
});
