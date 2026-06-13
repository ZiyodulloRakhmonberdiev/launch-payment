document.addEventListener("DOMContentLoaded", () => {
  // 🔹 Read formData from localStorage
  let formData = null;

  try {
    const raw = localStorage.getItem("formData");
    if (raw) {
      formData = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Error parsing formData from localStorage:", e);
  }

  // 🔹 Select DOM elements
  const ismEl = document.querySelector(".ism");
  const telEl = document.querySelector(".tel");
  const tarifEl = document.querySelector(".tarif");
  const sanEl = document.querySelector(".san");


  // 🔹 Set date/time: dd/mm/yyyy hh:mm:ss
  if (sanEl) {
    const now = new Date();

    const pad = (n) => n.toString().padStart(2, "0");

    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1); // 0-based
    const year = now.getFullYear();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());

    const formatted = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    sanEl.textContent = formatted;
  }

  // 🔹 If no formData – stop here (leave placeholders)
  if (!formData) {
    console.warn("formData not found in localStorage");
    return;
  }

  if (!ismEl || !telEl) {
    console.error("One or more required elements (.ism, .tel) not found");
    return;
  }

  // 🔹 Fill values from formData
  //  formData structure expected:
  //  { name: "...", phone_number: "...", type: "..." }

  ismEl.textContent = formData.name || "—";
  telEl.textContent = formData.phone_number || "—";
  if (tarifEl) {
    const TARIF_LABELS = {
      standart: "Standart",
      premium: "Premium",
      booking: "Ro'yxatdan o'tish",
      vip: "VIP",
    };
    const key = String(formData.type || "").toLowerCase();
    tarifEl.textContent = TARIF_LABELS[key] || formData.type || "—";
  }
});



const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzF-LJnR2JDyUSIYRVcFYWegdrC7jU7oxkAbkzAUn3oLEEUjMnMwzgwAQuayJG0sklZ/exec";
const PENDING_KEY = "pendingSubmission";

// Utility: convert JS payload to FormData (Apps Script expects form payload)
function payloadToFormData(payloadObj) {
  const fd = new FormData();
  Object.entries(payloadObj).forEach(([k, v]) => {
    fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
  });
  return fd;
}

// Chekni Sheetsga FAQAT BIR MARTA yuboramiz.
// Avvalgi retry/beacon mexanizmi dublikat qatorlar ochardi:
// brauzer Apps Script javobini o'qiy olmasa (CORS), so'rov serverga
// yetib borgan bo'lsa ham "xato" deb hisoblab qayta-qayta yuborardi.
window.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("thankYouMessage");

  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) {
    console.log("No pending submission found.");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid pending payload JSON:", e);
    localStorage.removeItem(PENDING_KEY);
    return;
  }

  // Sana/vaqt pay.js da qo'yilmagan bo'lsa, shu yerda to'ldiramiz
  if (!payload.sana || !payload.vaqt) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    payload.sana = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    payload.vaqt = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  // Qayta yubormaslik uchun pendingni yuborishdan OLDIN o'chiramiz —
  // sahifa yangilansa ham ikkinchi marta ketmaydi.
  localStorage.removeItem(PENDING_KEY);

  // mode: "no-cors" — Apps Script javobini o'qib bo'lmaydi, lekin so'rov
  // ishonchli yetib boradi va CORS xatosi chiqmaydi.
  fetch(SHEET_URL, {
    method: "POST",
    body: payloadToFormData(payload),
    mode: "no-cors",
  })
    .then(() => {
      console.log("Chek ma'lumoti yuborildi.");
      if (el) el.textContent = "Rahmat! Sizning ma'lumotingiz qabul qilindi.";
    })
    .catch((e) => {
      // Faqat chinakam tarmoq uzilishida ishlaydi (masalan, internet yo'q)
      console.error("Chek yuborishda tarmoq xatosi:", e);
      // Keyingi urinish uchun qaytarib qo'yamiz (faqat shu holatda)
      localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    });
});
