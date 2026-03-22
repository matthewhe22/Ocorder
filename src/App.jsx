import { useState, useEffect, useRef, Fragment } from "react";

// ─── LOGO ─────────────────────────────────────────────────────────────────────
const LOGO_B64 = "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";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const INITIAL_DATA = {
  strataPlans: [
    {
      id: "SP12345",
      name: "Harbour View Residences",
      address: "45 Marina Drive, Sydney NSW 2000",
      lots: [
        { id: "L1", number: "Lot 1", level: "Ground", type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L2", number: "Lot 2", level: "Level 1", type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L3", number: "Lot 3", level: "Level 2", type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L4", number: "Lot 4", level: "Level 3", type: "Residential", ownerCorps: ["OC-A", "OC-B"] },
        { id: "L5", number: "Lot 5", level: "Level 4", type: "Commercial", ownerCorps: ["OC-B"] },
        { id: "L6", number: "Lot 6", level: "Level 5", type: "Commercial", ownerCorps: ["OC-B"] },
        { id: "L7", number: "Lot 7 (Parking)", level: "Basement", type: "Parking", ownerCorps: ["OC-A","OC-B"] },
      ],
      ownerCorps: {
        "OC-A": { name: "Owner Corporation A — Residential", levy: 1200 },
        "OC-B": { name: "Owner Corporation B — Commercial", levy: 2400 },
      },
      products: [
        { id: "P1", name: "OC Certificate — Standard", description: "s151 SMA Owner Corporation Certificate", price: 220, secondaryPrice: 150, turnaround: "5 business days", perOC: true, category: "oc" },
        { id: "P2", name: "OC Certificate — Urgent", description: "Priority processing, 24–48 hour turnaround", price: 385, secondaryPrice: 280, turnaround: "1–2 business days", perOC: true, category: "oc" },
        { id: "P3", name: "Register of Owners Search", description: "Current register of lot owners and addresses", price: 55, turnaround: "3 business days", perOC: false, category: "oc" },
        { id: "P4", name: "Insurance Certificate of Currency", description: "Current building insurance details and certificate", price: 75, turnaround: "2 business days", perOC: false, category: "oc" },
        { id: "P5", name: "Meeting Minutes — Last 2 Years", description: "Minutes of AGM and general meetings", price: 110, turnaround: "5 business days", perOC: false, category: "oc" },
        { id: "P6", name: "Financial Statements", description: "Latest audited financial statements", price: 95, turnaround: "5 business days", perOC: false, category: "oc" },
        { id: "K1", name: "Building Entry Key", description: "Standard building entry key — price confirmed on invoice", price: 0, turnaround: "2–3 business days", perOC: false, category: "keys" },
        { id: "K2", name: "Car Park Fob", description: "Car park access fob/swipe — price confirmed on invoice", price: 0, turnaround: "2–3 business days", perOC: false, category: "keys" },
        { id: "K3", name: "Garage Remote", description: "Garage/gate remote control — price confirmed on invoice", price: 0, turnaround: "3–5 business days", perOC: false, category: "keys" },
      ],
      active: true,
    },
  ],
  orders: [],
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function genOrderId() {
  return "TOCS-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,5).toUpperCase();
}
function fmt(n) { return "$" + Number(n).toFixed(2); }
const GST_RATE = 0.1;
function gstOf(total) { return total / 11; }          // component inside GST-inclusive price
function exGst(total) { return total - gstOf(total); }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE  = /^(\+?61|0)[0-9]{8,9}$/;

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────
// Default contact state — single source of truth used for init, reset and cancel
const DEFAULT_CONTACT = {
  name: "", email: "", phone: "", companyName: "",
  applicantType: "owner", ownerName: "", ocReference: "",
  shippingAddress: { street: "", suburb: "", state: "NSW", postcode: "" },
};

// Infer effective applicant type for orders that pre-date the applicantType field
const getApplicantType = (ci) => ci?.applicantType || (ci?.companyName ? "agent" : "owner");

// Fixed shipping options for Keys/Fob orders.
// Costs for "keys-std" and "keys-express" come from plan.keysShipping.
const KEYS_SHIPPING_OPTIONS = [
  { id: "keys-pickup",  name: "Pick up from BM",      requiresAddress: false },
  { id: "keys-std",     name: "Standard Delivery",     requiresAddress: true  },
  { id: "keys-express", name: "Express Delivery",      requiresAddress: true  },
  { id: "keys-none",    name: "No Shipment Required",  requiresAddress: false },
];

const getKeysShippingCost = (optId, keysShipping) => {
  if (optId === "keys-std")     return keysShipping?.deliveryCost ?? 0;
  if (optId === "keys-express") return keysShipping?.expressCost  ?? 0;
  return 0; // pickup and none are always $0
};

// Compute the effective shipping cost for an option, considering per-product overrides
const calcShippingCost = (opt, cartItems, products) => {
  const prodMap = new Map((products || []).map(p => [p.id, p]));
  return cartItems.reduce((max, item) => {
    const prod = prodMap.get(item.productId);
    const c = prod?.shippingCosts?.[opt.id] ?? opt.cost;
    return Math.max(max, c);
  }, opt.cost);
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Ic = ({ n, s=18 }) => {
  const icons = {
    arrow:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>,
    arrowL:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>,
    check:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
    trash:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>,
    plus:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
    cart:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>,
    settings:<svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
    doc:     <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>,
    x:       <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
    bank:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"/></svg>,
    credit:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>,
    building:<svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M9 3.75H4.5A2.25 2.25 0 002.25 6v13.5H9M9 3.75h6M9 3.75V21m6-17.25h4.5A2.25 2.25 0 0121.75 6v13.5H15M15 3.75V21M9 9h.008v.008H9V9zm3 0h.008v.008H12V9zm3 0h.008v.008H15V9zm-6 3h.008v.008H9v-.008zm3 0h.008v.008H12v-.008zm3 0h.008v.008H15v-.008zm-6 3h.008v.008H9v-.008zm3 0h.008v.008H12v-.008zm3 0h.008v.008H15v-.008z"/></svg>,
    search:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>,
    copy:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>,
    lock:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>,
    eye:     <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
    eyeOff:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>,
    shield:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>,
    edit:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>,
    print:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>,
    list:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>,
    info:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>,
    logout:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>,
    upload:  <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13"/></svg>,
    mail:    <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>,
    image:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>,
    cloud:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"/></svg>,
    key:     <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>,
    invoice: <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>,
    truck:   <svg width={s} height={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>,
  };
  return icons[n] || null;
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --forest:      #1c3326;
    --forest2:     #243d2e;
    --forest3:     #2e5240;
    --sage:        #4a7255;
    --sage2:       #5a8a67;
    --sage-light:  #e4ede7;
    --sage-tint:   #f0f5f1;
    --cream:       #f7f3ec;
    --sand:        #ede8df;
    --sand2:       #e2dbd0;
    --white:       #ffffff;
    --ink:         #1a1f1c;
    --mid:         #4a5248;
    --muted:       #8a9488;
    --border:      #d8d2c8;
    --border2:     #eae5de;
    --ok:          #1e4a32;
    --ok-light:    #e3f0e8;
    --warn:        #7a5218;
    --warn-light:  #fdf0dc;
    --red:         #7a2020;
    --red-light:   #faeaea;
    --blue:        #1e3a6a;
    --blue-light:  #e4ecf8;
  }

  body { font-family: 'Inter', sans-serif; background: #ceceCD; color: var(--ink); min-height: 100vh; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* ── HEADER ── */
  .hdr { background: var(--forest); height: 60px; display: flex; align-items: center; padding: 0 2.5rem; position: sticky; top: 0; z-index: 200; justify-content: space-between; }
  .hdr-logo { height: 38px; display: block; }
  .hdr-nav { display: flex; align-items: center; gap: 4px; }
  .hn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.7); font-family: 'Inter', sans-serif; font-size: 0.73rem; font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; padding: 7px 16px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.15s; }
  .hn:hover { color: white; background: rgba(255,255,255,0.14); }
  .hn.act { background: rgba(255,255,255,0.18); color: white; border-color: rgba(255,255,255,0.26); }
  .cart-dot { background: var(--sage2); color: white; border-radius: 9px; font-size: 0.65rem; padding: 1px 6px; font-weight: 700; }

  /* ── LAYOUT ── */
  .main { flex: 1; max-width: 1080px; margin: 0 auto; width: 100%; padding: 3rem 2rem 6rem; }

  /* ── STEP BAR ── */
  .steps { display: flex; align-items: center; margin-bottom: 3rem; gap: 0; background: rgba(206,206,205,0.55); backdrop-filter: blur(8px); padding: 12px 2rem; border-bottom: 1px solid rgba(0,0,0,0.08); margin-left: -2rem; margin-right: -2rem; margin-top: -3rem; margin-bottom: 3rem; padding-left: 2rem; padding-right: 2rem; }
  .step-w { display: flex; align-items: center; flex: 1; }
  .step-w:last-child { flex: none; }
  .step-dot { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid rgba(0,0,0,0.18); background: rgba(255,255,255,0.6); font-size: 0.68rem; font-weight: 600; display: flex; align-items: center; justify-content: center; color: var(--muted); flex-shrink: 0; transition: all 0.3s; }
  .step-dot.done { background: var(--forest); border-color: var(--forest); color: white; cursor: pointer; }
  .step-dot.done:hover { background: var(--forest3); }
  .step-dot.curr { background: var(--forest); border-color: var(--forest); color: white; box-shadow: 0 0 0 4px rgba(28,51,38,0.14); }
  .step-lbl { font-size: 0.68rem; font-weight: 600; color: rgba(0,0,0,0.35); text-transform: uppercase; letter-spacing: 0.1em; margin-left: 7px; white-space: nowrap; }
  .step-lbl.curr { color: var(--forest); font-weight: 700; }
  .step-lbl.done { cursor: pointer; color: rgba(28,51,38,0.55); }
  .step-lbl.done:hover { color: var(--forest); }
  .step-line { flex: 1; height: 1px; background: rgba(0,0,0,0.15); margin: 0 10px; }
  .step-line.done { background: var(--forest); opacity: 0.35; }

  /* ── SEARCH ── */
  .search-wrap { position: relative; margin-bottom: 1.5rem; }
  .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--sage); pointer-events: none; }
  .search-input { width: 100%; padding: 15px 14px 15px 48px; border: 1.5px solid rgba(28,51,38,0.18); border-radius: 6px; font-family: 'Inter', sans-serif; font-size: 0.9rem; color: var(--ink); outline: none; transition: border-color 0.2s, box-shadow 0.2s; background: white; box-shadow: 0 2px 8px rgba(28,51,38,0.07); }
  .search-input:focus { border-color: var(--sage); box-shadow: 0 0 0 3px rgba(74,114,85,0.12); }
  .search-input::placeholder { color: #aaa; }
  .search-clear { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px; display: flex; }
  .search-clear:hover { color: var(--ink); }

  /* ── PAGE TITLES ── */
  .pg-title { font-family: 'Cormorant Garamond', serif; font-size: 2.8rem; font-weight: 600; line-height: 1.1; color: var(--forest); margin-bottom: 6px; }
  .pg-sub { font-size: 0.88rem; color: var(--muted); margin-bottom: 2.5rem; font-weight: 400; }

  /* ── PLAN CARDS ── */
  .plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-bottom: 2.5rem; }
  .plan-card { background: var(--white); border-left: 3px solid var(--sage); border-radius: 0 8px 8px 0; padding: 1.5rem; cursor: pointer; transition: box-shadow 0.2s, transform 0.15s, background 0.15s; position: relative; box-shadow: 0 2px 10px rgba(28,51,38,0.07); }
  .plan-card:hover { background: #f4faf6; box-shadow: 0 6px 24px rgba(28,51,38,0.13); transform: translateY(-1px); }
  .plan-card.sel { background: #f0faf4; border-left-color: var(--forest); box-shadow: 0 4px 16px rgba(28,51,38,0.12); }
  .pc-id { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sage); margin-bottom: 6px; }
  .plan-card.sel .pc-id { color: var(--forest); }
  .pc-name { font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 600; margin-bottom: 3px; color: var(--ink); }
  .plan-card.sel .pc-name { color: var(--forest); }
  .pc-addr { font-size: 0.8rem; color: var(--muted); }
  .plan-card.sel .pc-addr { color: var(--mid); }
  .pc-meta { font-size: 0.72rem; color: var(--sage); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--sage-light); font-weight: 600; }
  .plan-card.sel .pc-meta { border-color: var(--sage-light); }
  .sel-tick { position: absolute; top: 1rem; right: 1rem; width: 20px; height: 20px; background: var(--sage); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; }

  /* ── FORM ── */
  .form-row { margin-bottom: 1.4rem; }
  .f-label { display: block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mid); margin-bottom: 8px; }
  .f-select, .f-input { width: 100%; padding: 11px 14px; border: 1.5px solid var(--border); border-radius: 3px; font-family: 'Inter', sans-serif; font-size: 0.88rem; color: var(--ink); background: var(--white); outline: none; transition: border-color 0.2s; }
  .f-select:focus, .f-input:focus { border-color: var(--forest); box-shadow: 0 0 0 3px rgba(28,51,38,0.08); }
  .f-input.err { border-color: var(--red); }
  .f-err { font-size: 0.72rem; color: var(--red); margin-top: 5px; display: flex; align-items: center; gap: 4px; }

  /* ── TOOLTIP ── */
  .tip-wrap { position: relative; display: inline-flex; align-items: center; }
  .tip-icon { color: var(--muted); cursor: help; display: flex; margin-left: 4px; }
  .tip-box { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: var(--forest); color: white; font-size: 0.72rem; padding: 6px 10px; border-radius: 3px; white-space: nowrap; z-index: 100; pointer-events: none; opacity: 0; transition: opacity 0.15s; line-height: 1.5; max-width: 220px; white-space: normal; text-align: center; }
  .tip-wrap:hover .tip-box { opacity: 1; }
  .tip-box::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: var(--forest); }

  /* ── PRODUCT CARDS ── */
  .prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); }
  .prod-card { background: var(--white); padding: 1.5rem; transition: background 0.15s; }
  .prod-card:hover { background: var(--sage-tint); }
  .prod-card.added { background: var(--ok-light); }
  .prod-name { font-weight: 600; font-size: 0.9rem; color: var(--ink); margin-bottom: 5px; }
  .prod-desc { font-size: 0.78rem; color: var(--muted); margin-bottom: 8px; line-height: 1.55; }
  .prod-turna { font-size: 0.72rem; color: var(--mid); margin-bottom: 14px; font-weight: 500; }
  .prod-foot { display: flex; align-items: flex-end; justify-content: space-between; }
  .prod-price { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 600; color: var(--forest); line-height: 1; }
  .prod-price-sub { font-size: 0.66rem; color: var(--muted); font-family: 'Inter', sans-serif; font-weight: 400; margin-top: 3px; }
  .prod-price-tier { font-size: 0.7rem; color: var(--mid); font-family: 'Inter', sans-serif; margin-top: 2px; }
  .add-btn { background: var(--forest); color: white; border: none; padding: 8px 16px; font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background 0.15s; border-radius: 3px; }
  .add-btn:hover { background: var(--forest2); }
  .added-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 600; color: var(--ok); background: var(--ok-light); padding: 6px 12px; border-radius: 20px; }
  .oc-pill { font-size: 0.7rem; font-weight: 500; background: var(--sage-tint); border: 1px solid var(--sage-light); padding: 4px 10px; border-radius: 20px; color: var(--mid); display: inline-block; margin: 2px; }
  .per-oc-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em; background: var(--sage-light); color: var(--forest3); padding: 2px 8px; border-radius: 2px; text-transform: uppercase; }

  /* ── COMING SOON ── */
  .coming-soon-badge { display: inline-block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; background: var(--warn-light); color: var(--warn); border: 1px solid #e8c97a; padding: 2px 7px; border-radius: 20px; margin-left: 6px; vertical-align: middle; }

  /* ── STICKY CART FOOTER ── */
  .sticky-cart { position: fixed; bottom: 0; left: 0; right: 0; background: var(--forest); color: white; z-index: 150; padding: 0 2rem; height: 60px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 -4px 20px rgba(0,0,0,0.15); }
  .sc-left { display: flex; align-items: center; gap: 12px; }
  .sc-count { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .sc-items { font-size: 0.85rem; font-weight: 500; }
  .sc-total { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 600; }
  .sc-gst { font-size: 0.68rem; color: rgba(255,255,255,0.5); margin-top: 1px; text-align: right; }

  /* ── BUTTONS ── */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 28px; font-family: 'Inter', sans-serif; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; border: 1.5px solid transparent; transition: all 0.15s; border-radius: 3px; }
  .btn-blk { background: var(--forest); color: white; border-color: var(--forest); border-radius: 28px; box-shadow: 0 4px 14px rgba(28,51,38,0.28); }
  .btn-blk:hover:not(:disabled) { background: var(--forest2); box-shadow: 0 6px 20px rgba(28,51,38,0.38); }
  .btn-blk:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
  .btn-sage { background: var(--sage); color: white; border-color: var(--sage); }
  .btn-sage:hover:not(:disabled) { background: var(--sage2); }
  .btn-sage:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-out { background: transparent; color: var(--forest); border-color: var(--border); }
  .btn-out:hover { border-color: var(--forest); background: var(--sage-tint); }
  .btn-lg { padding: 15px 36px; font-size: 0.8rem; }
  .btn-block { width: 100%; justify-content: center; }

  /* ── CART ── */
  .cart-item { display: flex; align-items: flex-start; gap: 14px; padding: 1.1rem 0; border-bottom: 1px solid var(--border2); }
  .ci-info { flex: 1; }
  .ci-name { font-weight: 600; font-size: 0.88rem; margin-bottom: 3px; }
  .ci-meta { font-size: 0.76rem; color: var(--muted); line-height: 1.6; }
  .ci-price { font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; font-weight: 600; color: var(--forest); white-space: nowrap; }
  .ci-rm { background: none; border: none; cursor: pointer; color: var(--muted); padding: 2px; transition: color 0.15s; display: flex; }
  .ci-rm:hover { color: var(--red); }
  .cart-total-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
  .cart-total-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mid); }
  .cart-total-amt { font-family: 'Cormorant Garamond', serif; font-size: 1.6rem; font-weight: 600; color: var(--forest); }
  .cart-gst-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.78rem; color: var(--muted); border-top: 1px solid var(--border2); margin-top: 4px; }
  .cart-grand-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0 0; border-top: 2px solid var(--forest); margin-top: 4px; }

  /* ── PANEL / CARD ── */
  .panel { background: var(--white); border: 1px solid var(--border); padding: 1.8rem; }
  .panel + .panel { margin-top: 1px; }
  .section-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
  .section-tt { font-family: 'Cormorant Garamond', serif; font-size: 1.3rem; font-weight: 600; color: var(--forest); }
  .divider { height: 1px; background: var(--border2); margin: 1.5rem 0; }

  /* ── PAYMENT ── */
  .pay-method { border: 1.5px solid var(--border); padding: 1.2rem; cursor: pointer; transition: all 0.15s; margin-bottom: 8px; display: flex; align-items: center; gap: 14px; border-radius: 3px; }
  .pay-method:hover { border-color: var(--forest); background: var(--sage-tint); }
  .pay-method.sel { border-color: var(--forest); background: var(--sage-tint); }
  .pm-icon { width: 42px; height: 42px; background: var(--cream); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--forest); flex-shrink: 0; border-radius: 3px; }
  .pm-name { font-weight: 600; font-size: 0.88rem; margin-bottom: 2px; }
  .pm-desc { font-size: 0.76rem; color: var(--muted); }
  .radio-ring { width: 18px; height: 18px; border: 1.5px solid var(--border); border-radius: 50%; margin-left: auto; flex-shrink: 0; position: relative; }
  .radio-ring.sel { border-color: var(--forest); }
  .radio-ring.sel::after { content: ''; position: absolute; inset: 3px; background: var(--forest); border-radius: 50%; }
  .bank-box { background: var(--cream); border: 1px solid var(--sand); padding: 1.2rem; margin-top: 1rem; border-radius: 3px; }
  .bank-row { display: flex; justify-content: space-between; font-size: 0.83rem; padding: 5px 0; border-bottom: 1px solid var(--sand2); }
  .bank-row:last-child { border: none; }
  .bl { color: var(--muted); } .bv { font-weight: 600; color: var(--ink); }

  /* ── SUCCESS ── */
  .success-wrap { max-width: 600px; margin: 0 auto; padding: 2rem 0; }
  .success-ring { width: 80px; height: 80px; border-radius: 50%; background: var(--forest); display: flex; align-items: center; justify-content: center; color: white; margin: 0 auto 2rem; }
  .order-code-wrap { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 1rem 0; }
  .order-code { font-family: 'Cormorant Garamond', serif; font-size: 1.6rem; font-weight: 600; letter-spacing: 0.1em; color: var(--forest); background: var(--cream); border: 1px dashed var(--sage); padding: 14px 28px; display: inline-block; border-radius: 3px; }
  .copy-btn { background: var(--sage-tint); border: 1px solid var(--sage-light); color: var(--forest); cursor: pointer; padding: 8px; border-radius: 3px; display: flex; transition: all 0.15s; }
  .copy-btn:hover { background: var(--sage-light); }
  .copy-btn.copied { background: var(--ok-light); border-color: var(--ok); color: var(--ok); }

  /* ── ALERT ── */
  .alert { padding: 12px 16px; font-size: 0.82rem; border-radius: 3px; margin-bottom: 1rem; border-left: 3px solid; }
  .alert-info { background: var(--blue-light); color: var(--blue); border-color: var(--blue); }
  .alert-ok { background: var(--ok-light); color: var(--ok); border-color: var(--ok); }
  .alert-warn { background: var(--warn-light); color: var(--warn); border-color: var(--warn); }
  @keyframes warnPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(180,90,0,0); } 40% { box-shadow: 0 0 0 5px rgba(180,90,0,0.22); } }
  .pulse-warn { animation: warnPulse 0.7s ease; }

  /* ── ADMIN ── */
  .admin-bar { display: flex; gap: 0; border-bottom: 2px solid var(--forest); margin-bottom: 2rem; }
  .at { background: none; border: none; font-family: 'Inter', sans-serif; font-size: 0.74rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 20px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
  .at.act { color: var(--forest); border-color: var(--forest); }
  .at:hover { color: var(--forest3); }
  .tbl { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  .tbl th { text-align: left; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding: 10px 14px; border-bottom: 2px solid var(--border); }
  .tbl td { padding: 12px 14px; border-bottom: 1px solid var(--border2); vertical-align: middle; }
  .tbl tr:hover td { background: var(--sage-tint); }
  .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .bg-g { background: var(--ok-light); color: var(--ok); }
  .bg-b { background: var(--blue-light); color: var(--blue); }
  .bg-gold { background: var(--warn-light); color: var(--warn); }
  .bg-r { background: var(--red-light); color: var(--red); }
  .bg-gray { background: var(--cream); color: var(--mid); border: 1px solid var(--border); }
  .bg-teal { background: #e0f5f2; color: #0d6e62; }
  .bg-slate { background: #e8edf5; color: #2d4a7a; }
  .bg-purple { background: #f3f0ff; color: #6d28d9; }
  /* Category selector cards */
  .cat-card { background: #fff; border: 2px solid var(--border); border-radius: 8px; padding: 18px 20px; cursor: pointer; transition: all 0.18s; display: flex; flex-direction: column; gap: 6px; text-align: left; width: 100%; position: relative; }
  .cat-card:hover { border-color: var(--sage); box-shadow: 0 4px 16px rgba(28,51,38,0.1); transform: translateY(-1px); }
  .cat-card.cat-selected { border-color: var(--forest); background: #f4faf6; box-shadow: 0 4px 16px rgba(28,51,38,0.12); }
  .cat-card-icon { font-size: 1.6rem; margin-bottom: 4px; }
  .cat-card-title { font-size: 0.95rem; font-weight: 700; color: var(--forest); }
  .cat-card-sub { font-size: 0.78rem; color: var(--mid); line-height: 1.4; }
  .tbl-act-btn { background: none; border: 1px solid var(--border); font-family: 'Inter', sans-serif; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 10px; border-radius: 3px; transition: all 0.15s; color: var(--mid); }
  .tbl-act-btn:hover { border-color: var(--forest); color: var(--forest); background: var(--sage-tint); }
  .tbl-act-btn.danger { color: var(--red); border-color: var(--red-light); }
  .tbl-act-btn.danger:hover { background: var(--red-light); }
  .tbl-act-btn.success { color: var(--ok); border-color: var(--ok-light); }
  .tbl-act-btn.success:hover { background: var(--ok-light); }

  /* ── LOGIN SCREEN ── */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--cream); padding: 2rem; }
  .login-card { background: white; border: 1px solid var(--border); padding: 2.5rem; width: 100%; max-width: 380px; }
  .login-logo { height: 36px; margin-bottom: 2rem; filter: invert(1) sepia(1) saturate(0) brightness(0.3); }
  .login-title { font-family: 'Cormorant Garamond', serif; font-size: 1.6rem; font-weight: 600; color: var(--forest); margin-bottom: 6px; }
  .login-sub { font-size: 0.82rem; color: var(--muted); margin-bottom: 2rem; }
  .pw-wrap { position: relative; }
  .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted); display: flex; padding: 2px; }
  .pw-toggle:hover { color: var(--ink); }
  .login-err { font-size: 0.78rem; color: var(--red); background: var(--red-light); padding: 8px 12px; border-radius: 3px; margin-bottom: 1rem; display: flex; align-items: center; gap: 6px; }

  /* ── MODAL ── */
  .overlay { position: fixed; inset: 0; background: rgba(10,20,14,0.65); z-index: 400; display: flex; align-items: center; justify-content: center; padding: 1rem; animation: fi 0.15s; }
  .modal { background: white; padding: 2rem; max-width: 500px; width: 100%; border-top: 3px solid var(--forest); max-height: 85vh; overflow-y: auto; border-radius: 0 0 3px 3px; }
  .modal-tt { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; color: var(--forest); }
  @keyframes fi { from { opacity: 0 } to { opacity: 1 } }

  /* ── STEP 1 — NEW LAYOUT ── */
  .s1-title { background:white; border-radius:14px; padding:30px 30px 26px; margin-bottom:14px; box-shadow:0 2px 12px rgba(0,0,0,0.06); border:1px solid #e4e4e0; }
  .s1-eyebrow { font-size:0.6rem; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:var(--sage); margin-bottom:8px; }
  .s1-h1 { font-family:'Cormorant Garamond',serif; font-size:2.6rem; font-weight:400; color:var(--forest); line-height:1.08; letter-spacing:-0.01em; margin-bottom:8px; }
  .s1-sub { font-size:0.82rem; color:var(--muted); line-height:1.6; margin-bottom:20px; }
  .s1-search-bar { display:flex; align-items:center; gap:10px; background:#f6f6f3; border:1.5px solid #deded8; border-radius:100px; padding:11px 12px 11px 20px; transition:all 0.2s; }
  .s1-search-bar:focus-within { border-color:var(--sage); background:white; box-shadow:0 4px 18px rgba(28,51,38,0.08); }
  .s1-search-bar input { flex:1; border:none; background:transparent; font-family:'Inter',sans-serif; font-size:0.9rem; color:var(--ink); outline:none; }
  .s1-search-bar input::placeholder { color:#aaaa9e; font-weight:300; }
  .s1-search-sel { flex:1; font-size:0.9rem; color:var(--forest); font-weight:500; }
  .s1-search-btn { background:var(--forest); color:white; border:none; border-radius:100px; padding:7px 18px; font-size:0.72rem; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; white-space:nowrap; letter-spacing:0.04em; }
  .s1-search-btn:hover { background:var(--forest3); }
  /* How It Works 5-cell grid */
  .hiw-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:2px; border-radius:12px; overflow:hidden; background:#c4c4c2; margin-bottom:14px; box-shadow:0 2px 10px rgba(0,0,0,0.07); }
  .hiw-cell { background:white; padding:18px 14px 16px; display:flex; flex-direction:column; gap:7px; position:relative; }
  .hiw-cell.hiw-act { background:var(--forest); }
  .hiw-ghost { font-size:2.6rem; font-weight:700; color:#f0f0ed; position:absolute; top:8px; right:10px; line-height:1; font-family:'Cormorant Garamond',serif; }
  .hiw-cell.hiw-act .hiw-ghost { color:rgba(255,255,255,0.07); }
  .hiw-emoji { font-size:1.35rem; position:relative; z-index:1; }
  .hiw-name { font-size:0.74rem; font-weight:600; color:var(--ink); line-height:1.3; position:relative; z-index:1; }
  .hiw-cell.hiw-act .hiw-name { color:white; }
  .hiw-desc { font-size:0.64rem; color:var(--muted); line-height:1.5; position:relative; z-index:1; }
  .hiw-cell.hiw-act .hiw-desc { color:rgba(255,255,255,0.55); }
  /* Selected building card */
  .bsel { border:2px solid var(--forest); border-radius:14px; overflow:hidden; box-shadow:0 4px 20px rgba(28,51,38,0.12); margin-bottom:14px; background:white; }
  .bsel-hdr { background:var(--forest); padding:12px 18px; display:flex; align-items:center; justify-content:space-between; }
  .bsel-hdr-lbl { font-size:0.58rem; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:rgba(255,255,255,0.65); display:flex; align-items:center; gap:8px; }
  .bsel-hdr-check { width:18px; height:18px; border-radius:50%; background:rgba(255,255,255,0.15); border:1.5px solid rgba(255,255,255,0.3); display:flex; align-items:center; justify-content:center; font-size:10px; color:white; flex-shrink:0; }
  .bsel-change { font-size:0.7rem; color:rgba(255,255,255,0.6); cursor:pointer; background:rgba(255,255,255,0.1); border-radius:20px; padding:4px 12px; border:none; font-family:'Inter',sans-serif; transition:all 0.15s; }
  .bsel-change:hover { color:white; background:rgba(255,255,255,0.2); }
  .bsel-body { padding:18px 20px 20px; }
  .bsel-name { font-family:'Cormorant Garamond',serif; font-size:1.55rem; font-weight:400; color:var(--forest); margin-bottom:4px; line-height:1.2; }
  .bsel-addr { font-size:0.78rem; color:var(--muted); margin-bottom:16px; display:flex; align-items:center; gap:5px; }
  .bsel-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .bsel-stat { background:#f6f6f3; border:1px solid #e8e8e3; border-radius:9px; padding:11px 14px; }
  .bsel-stat-val { font-size:1.7rem; font-weight:700; color:var(--forest); line-height:1; font-family:'Cormorant Garamond',serif; }
  .bsel-stat-lbl { font-size:0.6rem; font-weight:600; color:var(--muted); letter-spacing:0.06em; text-transform:uppercase; margin-top:2px; }
  .bsel-sp { margin-top:12px; padding-top:12px; border-top:1px solid #eaeae6; font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:6px; }
  .bsel-sp-badge { background:#f0f6f2; border:1px solid #c8dece; border-radius:5px; padding:2px 8px; font-size:0.62rem; font-weight:700; color:var(--sage); letter-spacing:0.04em; }
  @media(max-width:720px){ .hiw-grid{ grid-template-columns:1fr 1fr; } }
  @media(max-width:800px){ .payment-grid{ grid-template-columns:1fr !important; } }

  /* ── LOT PICKER MODAL ── */
  .lot-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 55vh; overflow-y: auto; }
  .lot-card { border: 1.5px solid var(--border); padding: 12px; cursor: pointer; border-radius: 3px; transition: all 0.15s; }
  .lot-card:hover { border-color: var(--forest); background: var(--sage-tint); }
  .lot-card.sel { border-color: var(--forest); background: var(--forest); color: white; }
  .lc-num { font-weight: 700; font-size: 0.88rem; margin-bottom: 3px; }
  .lot-card.sel .lc-num { color: white; }
  .lc-detail { font-size: 0.72rem; color: var(--muted); }
  .lot-card.sel .lc-detail { color: rgba(255,255,255,0.6); }
  .lc-type { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; color: var(--sage); }
  .lot-card.sel .lc-type { color: rgba(255,255,255,0.7); }

  /* ── LOT SELECTOR TOGGLE ── */
  .lot-picker-btn { display: none; }
  @media (max-width: 640px) {
    .lot-select-desktop { display: none; }
    .lot-picker-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 11px 14px; border: 1.5px solid var(--border); border-radius: 3px; background: white; font-family: 'Inter', sans-serif; font-size: 0.88rem; color: var(--ink); cursor: pointer; justify-content: space-between; }
    .lot-picker-btn:focus { border-color: var(--forest); box-shadow: 0 0 0 3px rgba(28,51,38,0.08); outline: none; }
  }

  /* ── EMPTY ── */
  .empty { text-align: center; padding: 3rem; color: var(--muted); }

  /* ── PRINT STYLES ── */
  @media print {
    .hdr, .steps, .btn, .sticky-cart, .no-print { display: none !important; }
    .main { padding: 0; max-width: 100%; }
    body { background: white; }
    .print-receipt { display: block !important; }
  }
  .print-receipt { display: none; }

  /* ── RESPONSIVE ── */
  @media (max-width: 640px) {
    .main { padding: 2rem 1rem 6rem; }
    .hdr { padding: 0 1rem; }
    .pg-title { font-size: 2rem; }
    .plan-grid, .prod-grid { grid-template-columns: 1fr; }
    .sticky-cart { padding: 0 1rem; }
    .lot-cards { grid-template-columns: 1fr; }
    .steps { overflow-x: auto; padding-bottom: 4px; }
    .step-lbl { display: none; }
    .step-lbl.curr { display: block; }
  }
  ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: var(--cream); } ::-webkit-scrollbar-thumb { background: var(--sage-light); }
`;

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [currentView, setCurrentView] = useState("portal");
  const [step, setStep] = useState(1);
  const [selPlan, setSelPlan] = useState(null);
  const [selLot, setSelLot] = useState(null);
  const [orderCategory, setOrderCategory] = useState(null); // "oc" | "keys"
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [payMethod, setPayMethod] = useState("bank");
  const [contact, setContact] = useState(DEFAULT_CONTACT);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [lotAuthFile, setLotAuthFile] = useState(null);
  const [adminTab, setAdminTab] = useState("plans");
  const [adminToken, setAdminToken] = useState(() => {
    try { return sessionStorage.getItem("admin_token") || null; } catch { return null; }
  });
  const [pubConfig, setPubConfig] = useState(null);
  const [stripeConfirming, setStripeConfirming] = useState(false);
  const [stripeConfirmErr, setStripeConfirmErr] = useState("");
  const [stripeOrderId, setStripeOrderId] = useState(null);
  const [stripeCancelled, setStripeCancelled] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  // Load persisted data from server on mount
  useEffect(() => {
    // Include admin token if already in sessionStorage (page reload) — /api/data returns
    // orders only to authenticated callers; unauthenticated callers get strataPlans only.
    const savedTok = (() => { try { return sessionStorage.getItem("admin_token"); } catch { return null; } })();
    const dataHeaders = savedTok ? { "Authorization": "Bearer " + savedTok } : {};
    fetch("/api/data", { headers: dataHeaders }).then(r => r.json()).then(d => setData(d)).catch(() => {});
    fetch("/api/config/public").then(r => r.json()).then(d => setPubConfig(d)).catch(() => {});
    // Detect Stripe payment redirect: /complete?orderId=xxx&stripeOk=1
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripeOk") === "1" && params.get("orderId")) {
      const oid = params.get("orderId");
      setStripeOrderId(oid);
      setStripeConfirming(true);
      setStep(6);
      setCurrentView("portal");
    }
    // Detect Stripe cancel redirect: /?cancelled=1  — clean URL and show cancellation banner
    if (params.get("cancelled") === "1") {
      window.history.replaceState({}, "", "/");
      setStripeCancelled(true);
    }
    // Detect privacy policy route
    if (window.location.pathname === "/privacy-policy") {
      setCurrentPath("/privacy-policy");
    }
  }, []);

  // Call stripe-confirm endpoint after Stripe redirects back with ?stripeOk=1
  useEffect(() => {
    if (!stripeConfirming || !stripeOrderId) return;
    fetch(`/api/orders/${stripeOrderId}/stripe-confirm`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.order) {
          setOrder(d.order);
          setStripeConfirming(false);
          window.history.replaceState({}, "", `/complete?orderId=${stripeOrderId}`);
          try { const o = d.order; localStorage.setItem("tocs_last_order", JSON.stringify({ id: o.id, date: o.date, email: o.contactInfo.email, total: o.total, payment: o.payment, orderCategory: o.orderCategory })); } catch {}
        } else {
          setStripeConfirmErr(d.error || "Payment could not be verified. Please contact support.");
          setStripeConfirming(false);
        }
      })
      .catch(() => {
        setStripeConfirmErr("Network error. Please contact support at info@tocs.co.");
        setStripeConfirming(false);
      });
  }, [stripeConfirming, stripeOrderId]);

  const plan = data.strataPlans.find(p => p.id === selPlan);
  const lot  = plan?.lots.find(l => l.id === selLot);
  const shippingCost = selectedShipping?.cost || 0;
  const total = cart.reduce((s, i) => s + i.price, 0) + shippingCost;

  const inCart = (pid, ocId=null) => cart.some(i => i.key === `${pid}-${ocId}-${selLot}`);

  const addProd = (product) => {
    if (!product.perOC) {
      const key = `${product.id}-null-${selLot}`;
      if (cart.some(i => i.key === key)) return;
      setCart(p => [...p, { key, productId: product.id, productName: product.name, planId: plan.id, planName: plan.name, lotId: selLot, lotNumber: lot.number, ocId: null, ocName: null, price: product.price, turnaround: product.turnaround }]);
    } else {
      lot.ownerCorps.forEach((ocId, idx) => {
        const key = `${product.id}-${ocId}-${selLot}`;
        if (!cart.some(i => i.key === key)) {
          const oc = plan.ownerCorps[ocId];
          const price = idx === 0 ? product.price : (product.secondaryPrice ?? product.price);
          setCart(p => [...p, { key, productId: product.id, productName: product.name, planId: plan.id, planName: plan.name, lotId: selLot, lotNumber: lot.number, ocId, ocName: oc?.name || ocId, price, turnaround: product.turnaround, isSecondaryOC: idx > 0 }]);
        }
      });
    }
  };

  const placeOrder = async (setPlacing, setErr) => {
    const id = genOrderId();
    const isKeys = orderCategory === "keys";
    const orderPayment = isKeys ? "invoice" : payMethod;
    const orderStatus = isKeys ? "Invoice to be issued"
      : orderPayment === "stripe" ? "Awaiting Stripe Payment"
      : orderPayment === "bank"   ? "Awaiting Payment"
      : "Paid";
    const contactInfo = {
      ...contact,
      // Include shippingAddress for keys orders with a paid delivery option
      shippingAddress: (orderCategory === "keys" && selectedShipping && selectedShipping.requiresAddress !== false) ? contact.shippingAddress : undefined,
    };
    const o = { id, date: new Date().toISOString(), contactInfo, items: cart, total, selectedShipping: selectedShipping || null, payment: orderPayment, status: orderStatus, lotAuthFileName: lotAuthFile ? lotAuthFile.name : null, orderCategory: orderCategory || "oc" };
    try {
      let body = { order: o };
      if (lotAuthFile) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(lotAuthFile);
        });
        body.lotAuthority = { filename: lotAuthFile.name, contentType: lotAuthFile.type || "application/octet-stream", data: base64 };
      }
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const respData = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Server returned an error (e.g. KV unavailable) — surface it to the user
        if (setErr) setErr(respData.error || `Submission failed (${r.status}). Please try again.`);
        setPlacing(false);
        return; // Do NOT advance to confirmation
      }
      // Stripe payment: redirect to Stripe's hosted checkout page
      if (respData.redirect) {
        window.location.href = respData.redirect;
        return; // Page navigates away — do not advance to step 6
      }
    } catch { /* Network / offline — still show confirmation so user knows their order */ }
    setOrder(o);
    setData(p => ({ ...p, orders: [o, ...p.orders] }));
    setCart([]);
    setStep(6);
    setPlacing(false);
    try { localStorage.setItem("tocs_last_order", JSON.stringify({ id: o.id, date: o.date, email: o.contactInfo.email, total: o.total, payment: o.payment, orderCategory: o.orderCategory })); } catch {}
  };

  const reset = () => { setStep(1); setSelPlan(null); setSelLot(null); setOrderCategory(null); setCart([]); setOrder(null); setContact(DEFAULT_CONTACT); setPayMethod("bank"); setLotAuthFile(null); setSelectedShipping(null); };

  // Auto-select the first shipping option when entering Step 3 (if none yet selected)
  useEffect(() => {
    if (step !== 3 || orderCategory !== "keys") return;
    const planShipping = plan?.shippingOptions || [];
    if (planShipping.length > 0 && !selectedShipping) {
      const opt = planShipping[0];
      const cost = calcShippingCost(opt, cart, plan?.products);
      setSelectedShipping({ id: opt.id, name: opt.name, cost, requiresAddress: opt.requiresAddress !== false });
    }
  }, [step, plan?.id]); // plan.id tracks plan changes; cart is stable while on step 3


  const goToStep = (s) => {
    if (s < step) setStep(s);
  };

  // 6 steps: 1=Plan, 2=Products, 3=Review, 4=Contact, 5=Payment, 6=Complete
  const STEPS = ["Select Plan", "Products", "Review", "Contact", "Payment", "Complete"];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="hdr">
          <img src={pubConfig?.logo || `data:image/png;base64,${LOGO_B64}`} alt="TOCS" className="hdr-logo" />
          <nav className="hdr-nav">
            <button className={`hn ${currentView === "portal" ? "act" : ""}`} onClick={() => {
              if (currentView === "portal" && step > 1) {
                setStep(1);
                setCart([]);
                setSelPlan(null);
                setSelLot(null);
                setOrderCategory(null);
              }
              setCurrentView("portal");
            }}>
              <Ic n="doc" s={14}/> Order Portal
            </button>
            <button className={`hn ${currentView === "admin" ? "act" : ""}`} onClick={() => setCurrentView("admin")}>
              <Ic n="settings" s={14}/> Admin
            </button>
            {currentView === "portal" && cart.length > 0 && (
              <button className="hn" onClick={() => step < 6 && setStep(3)}>
                <Ic n="cart" s={14}/> Cart <span className="cart-dot">{cart.length}</span>
              </button>
            )}
          </nav>
        </header>

        <main className="main">
          {currentPath === "/privacy-policy" ? (
            <PrivacyPolicy onBack={() => { setCurrentPath("/"); window.history.pushState({}, "", "/"); }} />
          ) : currentView === "portal" ? (
            <Portal step={step} setStep={setStep} goToStep={goToStep} plan={plan} selPlan={selPlan}
              setSelPlan={setSelPlan} lot={lot} selLot={selLot} setSelLot={setSelLot} data={data}
              cart={cart} setCart={setCart} total={total} addProd={addProd} inCart={inCart}
              order={order} payMethod={payMethod} setPayMethod={setPayMethod}
              placeOrder={placeOrder} reset={reset} contact={contact} setContact={setContact}
              lotAuthFile={lotAuthFile} setLotAuthFile={setLotAuthFile} STEPS={STEPS}
              pubConfig={pubConfig}
              orderCategory={orderCategory} setOrderCategory={setOrderCategory}
              selectedShipping={selectedShipping} setSelectedShipping={setSelectedShipping}
              shippingCost={shippingCost}
              stripeConfirming={stripeConfirming} stripeConfirmErr={stripeConfirmErr} stripeOrderId={stripeOrderId}
              stripeCancelled={stripeCancelled} setStripeCancelled={setStripeCancelled} />
          ) : (
            <Admin data={data} setData={setData} adminTab={adminTab} setAdminTab={setAdminTab}
              adminToken={adminToken} setAdminToken={setAdminToken} pubConfig={pubConfig} setPubConfig={setPubConfig} />
          )}
        </main>
      </div>
    </>
  );
}

// ─── PORTAL ───────────────────────────────────────────────────────────────────
function Portal({ step, setStep, goToStep, plan, selPlan, setSelPlan, lot, selLot, setSelLot, data, cart, setCart, total, addProd, inCart, order, payMethod, setPayMethod, placeOrder, reset, contact, setContact, lotAuthFile, setLotAuthFile, STEPS, pubConfig, orderCategory, setOrderCategory, selectedShipping, setSelectedShipping, shippingCost, stripeConfirming, stripeConfirmErr, stripeOrderId, stripeCancelled, setStripeCancelled }) {
  const [search, setSearch] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [keysPlacing, setKeysPlacing] = useState(false);
  const [keysPlaceErr, setKeysPlaceErr] = useState("");
  const [step2Attempted, setStep2Attempted] = useState(false);
  const [recentOrder, setRecentOrder] = useState(() => {
    try {
      const s = localStorage.getItem("tocs_last_order");
      if (!s) return null;
      const p = JSON.parse(s);
      return (Date.now() - new Date(p.date).getTime()) < 7 * 24 * 60 * 60 * 1000 ? p : null;
    } catch { return null; }
  });

  const filteredPlans = data.strataPlans.filter(p => {
    if (!p.active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
  });

  const emailValid = EMAIL_RE.test(contact.email);
  const phoneValid  = !contact.phone || PHONE_RE.test(contact.phone.replace(/\s/g, ""));
  const gst = gstOf(total);
  const exGstTotal = exGst(total);

  return (
    <div>
      {/* ── Stripe cancellation banner ── */}
      {stripeCancelled && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:"8px", padding:"14px 20px", marginBottom:"1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"1rem" }}>
          <div>
            <span style={{ fontWeight:600, color:"#92400e" }}>Payment cancelled.</span>
            {" "}<span style={{ color:"#78350f", fontSize:"0.88rem" }}>Your order was not processed. You can review your selections and try again.</span>
          </div>
          <button onClick={() => setStripeCancelled(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#92400e", fontSize:"1.2rem", lineHeight:1, padding:"0 4px", flexShrink:0 }} aria-label="Dismiss">×</button>
        </div>
      )}

      {step < 6 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div className="steps">
            {STEPS.map((lbl, i) => {
              const sNum = i + 1;
              const isDone = sNum < step;
              const isCurr = sNum === step;
              return (
                <div key={i} className="step-w" style={{ flex: i < STEPS.length - 1 ? 1 : "none" }}>
                  <div
                    className={`step-dot ${isDone ? "done" : isCurr ? "curr" : ""}`}
                    onClick={() => isDone && goToStep(sNum)}
                    title={isDone ? `Go back to ${lbl}` : ""}
                  >
                    {isDone ? <Ic n="check" s={12}/> : sNum}
                  </div>
                  <span
                    className={`step-lbl ${isCurr ? "curr" : ""} ${isDone ? "done" : ""}`}
                    onClick={() => isDone && goToStep(sNum)}
                  >{lbl}</span>
                  {i < STEPS.length - 1 && <div className={`step-line ${isDone ? "done" : ""}`}/>}
                </div>
              );
            })}
          </div>
          {step > 1 && (
            <button
              style={{ fontSize: "0.72rem", color: "var(--muted)", background: "none", border: "1px solid var(--border)", borderRadius: "5px", padding: "5px 12px", cursor: "pointer", letterSpacing: "0.04em" }}
              onClick={() => {
                setStep(1);
                setCart([]);
                setSelPlan(null);
                setSelLot(null);
                setOrderCategory(null);
                setSearch("");
              }}
            >
              ↩ Start New Order
            </button>
          )}
        </div>
      )}

      {/* ── STEP 1: SELECT PLAN ── */}
      {step === 1 && (
        <div>

          {/* ── Title block ── */}
          <div className="s1-title">
            <div className="s1-eyebrow">Top Owners Corporation Solution</div>
            <h1 className="s1-h1">TOCS Order Portal</h1>
            <p className="s1-sub">Order certificates, keys, fobs, swipes and more for your NSW strata property</p>
            {/* Search bar — shows input when no building selected, summary when selected */}
            {!selPlan ? (
              <div className="s1-search-bar">
                <Ic n="search" s={16} style={{ color: "#9a9a8e", flexShrink: 0 }}/>
                <input
                  placeholder="Search by building name or strata plan…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
                {search && (
                  <button className="s1-search-btn" style={{ background: "transparent", color: "var(--muted)", padding: "0 8px" }} onClick={() => setSearch("")}><Ic n="x" s={14}/></button>
                )}
              </div>
            ) : (
              <div className="s1-search-bar" style={{ background: "#f0f6f2", borderColor: "var(--sage-light)" }}>
                <Ic n="check" s={16} style={{ color: "var(--sage)", flexShrink: 0 }}/>
                <span className="s1-search-sel">{plan?.name}</span>
                <button className="s1-search-btn" onClick={() => { setSelPlan(null); setSelLot(null); setCart([]); setOrderCategory(null); setSearch(""); }}>Change</button>
              </div>
            )}
          </div>

          {/* ── Recent order banner ── */}
          {recentOrder && (
            <div style={{ background: "#f0f7f3", border: "1px solid #c0dbc9", borderRadius: "8px", padding: "12px 16px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", fontSize: "0.82rem" }}>
              <div>
                <strong style={{ color: "var(--forest)" }}>Recent order: {recentOrder.id}</strong>
                <span style={{ color: "var(--muted)", marginLeft: "10px" }}>{recentOrder.orderCategory === "keys" ? "Invoice to follow" : recentOrder.payment === "bank" ? "Awaiting bank transfer" : recentOrder.payment === "payid" ? "Awaiting PayID transfer" : "Paid"} · {fmt(recentOrder.total)}</span>
                <div style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "2px" }}>Confirmation sent to {recentOrder.email}</div>
              </div>
              <button onClick={() => { try { localStorage.removeItem("tocs_last_order"); } catch {} setRecentOrder(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1.1rem", lineHeight: 1, padding: "0 4px", flexShrink: 0 }} aria-label="Dismiss">×</button>
            </div>
          )}

          {/* ── How It Works — 5-cell grid ── */}
          <div className="hiw-grid">
            <div className="hiw-cell hiw-act">
              <div className="hiw-ghost">1</div>
              <div className="hiw-emoji">🏢</div>
              <div className="hiw-name">Find your building</div>
              <div className="hiw-desc">Search by strata plan or address</div>
            </div>
            <div className="hiw-cell">
              <div className="hiw-ghost">2</div>
              <div className="hiw-emoji">🛒</div>
              <div className="hiw-name">Select products</div>
              <div className="hiw-desc">Certs, keys, fobs, swipes &amp; more</div>
            </div>
            <div className="hiw-cell">
              <div className="hiw-ghost">3</div>
              <div className="hiw-emoji">📋</div>
              <div className="hiw-name">Review order</div>
              <div className="hiw-desc">Confirm your selections</div>
            </div>
            <div className="hiw-cell">
              <div className="hiw-ghost">4</div>
              <div className="hiw-emoji">👤</div>
              <div className="hiw-name">Contact details</div>
              <div className="hiw-desc">Applicant &amp; contact info</div>
            </div>
            <div className="hiw-cell">
              <div className="hiw-ghost">5</div>
              <div className="hiw-emoji">💳</div>
              <div className="hiw-name">Pay your way</div>
              <div className="hiw-desc">{pubConfig?.stripeEnabled ? "Bank · PayID · Card" : "Bank transfer · PayID"}</div>
            </div>
          </div>

          {/* ── Building search results (no plan selected) ── */}
          {!selPlan && (
            !search.trim() ? (
              <div className="empty" style={{ background: "rgba(255,255,255,0.5)", border: "1.5px dashed rgba(28,51,38,0.15)", borderRadius: "10px" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🏢</div>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 400, color: "var(--forest)" }}>Start typing to find your building.</p>
                <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>Search by address, building name, or Strata Plan number (e.g. SP12345).</p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="empty" style={{ background: "rgba(255,255,255,0.5)", border: "1.5px dashed rgba(28,51,38,0.15)", borderRadius: "10px" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔍</div>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.2rem", fontWeight: 400, color: "var(--forest)" }}>No matching buildings found.</p>
                <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>Try a partial address or your Strata Plan number (e.g. SP12345).</p>
              </div>
            ) : (
              <div className="plan-grid" style={{ marginBottom: "14px" }}>
                {filteredPlans.map(p => (
                  <div key={p.id} className="plan-card" onClick={() => { setCart([]); setSelLot(null); setSelPlan(p.id); setSearch(""); }}>
                    <div className="pc-id">{p.id}</div>
                    <div className="pc-name">{p.name}</div>
                    <div className="pc-addr">{p.address}</div>
                    <div className="pc-meta">{p.lots.length} lots &nbsp;·&nbsp; {Object.keys(p.ownerCorps).length} Owner Corporations</div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Selected building detail card ── */}
          {selPlan && plan && (
            <div className="bsel">
              <div className="bsel-hdr">
                <div className="bsel-hdr-lbl">
                  <div className="bsel-hdr-check">✓</div>
                  Building Selected
                </div>
                <button className="bsel-change" onClick={() => { setSelPlan(null); setSelLot(null); setCart([]); setOrderCategory(null); setSearch(""); }}>
                  Change ↗
                </button>
              </div>
              <div className="bsel-body">
                <div className="bsel-name">{plan.name}</div>
                <div className="bsel-addr">📍 {plan.address}</div>
                <div className="bsel-stats">
                  <div className="bsel-stat">
                    <div className="bsel-stat-val">{plan.lots.length}</div>
                    <div className="bsel-stat-lbl">Total Lots</div>
                  </div>
                  <div className="bsel-stat">
                    <div className="bsel-stat-val">{Object.keys(plan.ownerCorps).length}</div>
                    <div className="bsel-stat-lbl">Owner Corporations</div>
                  </div>
                </div>
                <div className="bsel-sp">
                  <span>Strata Plan</span>
                  <span className="bsel-sp-badge">{plan.id}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Category selector — shown once a plan is selected ── */}
          {selPlan && (
            <div style={{ marginBottom: "20px" }}>
              <div className="search-label" style={{ marginBottom: "12px" }}>What are you ordering?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <button className={`cat-card ${orderCategory === "oc" ? "cat-selected" : ""}`}
                  onClick={() => { setOrderCategory("oc"); setCart([]); setSelectedShipping(null); }}>
                  {orderCategory === "oc" && <span style={{ position:"absolute", top:10, right:10, color:"var(--forest)" }}><Ic n="check" s={16}/></span>}
                  <div className="cat-card-icon">📄</div>
                  <div className="cat-card-title">OC Certificates</div>
                  <div className="cat-card-sub">Owner Corporation Certificates, registers, insurance &amp; meeting minutes</div>
                </button>
                <button className={`cat-card ${orderCategory === "keys" ? "cat-selected" : ""}`}
                  onClick={() => { setOrderCategory("keys"); setCart([]); setSelectedShipping(null); }}>
                  {orderCategory === "keys" && <span style={{ position:"absolute", top:10, right:10, color:"var(--forest)" }}><Ic n="check" s={16}/></span>}
                  <div className="cat-card-icon">🗝️</div>
                  <div className="cat-card-title">Keys / Fobs / Remotes</div>
                  <div className="cat-card-sub">Building access keys, car park fobs, remotes — invoice issued after order review</div>
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-blk btn-lg" disabled={!selPlan || !orderCategory} onClick={() => setStep(2)}>
              Continue <Ic n="arrow" s={15}/>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: PRODUCTS ── */}
      {step === 2 && plan && (
        <div>
          <h1 className="pg-title">{plan.name}</h1>
          <p className="pg-sub">{plan.address} &nbsp;·&nbsp; {plan.id}</p>

          <div className="panel" style={{ marginBottom: "1px" }}>
            <label className="f-label">Select Lot</label>

            {/* Desktop: native select */}
            <select
              className="f-select lot-select-desktop"
              value={selLot || ""}
              onChange={e => { if (e.target.value !== selLot) { setCart([]); setLotAuthFile(null); } setSelLot(e.target.value); }}
            >
              <option value="">— Choose a lot —</option>
              {plan.lots.map(l => <option key={l.id} value={l.id}>{l.number} — {l.level} ({l.type})</option>)}
            </select>

            {/* Mobile: card picker trigger */}
            <button
              className="lot-picker-btn"
              onClick={() => setShowLotModal(true)}
            >
              <span>{selLot ? (() => { const l = plan.lots.find(x=>x.id===selLot); return l ? l.number + " — " + l.level : "— Choose a lot —"; })() : "— Choose a lot —"}</span>
              <Ic n="list" s={16}/>
            </button>

            {selLot && lot && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>Owner Corporations in this lot</div>
                <div>{lot.ownerCorps.map(ocId => <span key={ocId} className="oc-pill">{plan.ownerCorps[ocId]?.name || ocId}</span>)}</div>
              </div>
            )}
          </div>

          {selLot && (
            <>
              {/* ── Applicant Details ── */}
              <div style={{ margin: "1.5rem 0 0" }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "1rem" }}>Applicant Details</div>
                <div className="panel" style={{ marginBottom: 0 }}>
                  {/* Applicant type selector */}
                  <div className="form-row">
                    <label className="f-label">I am applying as</label>
                    <select className="f-input" value={contact.applicantType} onChange={e => setContact(p => ({ ...p, applicantType: e.target.value, companyName: "", ownerName: "" }))}>
                      <option value="owner">Owner</option>
                      <option value="agent">Agent / Representative</option>
                    </select>
                  </div>

                  {/* Owner: compulsory Owner Name */}
                  {contact.applicantType === "owner" && (
                    <div className="form-row">
                      <label className="f-label">Owner Name *</label>
                      <input className="f-input" type="text" placeholder="e.g. Jane Smith" value={contact.ownerName} onChange={e => setContact(p => ({...p, ownerName: e.target.value}))}/>
                      <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>Full name of the registered lot owner. Used by our team to verify entitlement.</p>
                    </div>
                  )}

                  {/* Agent: Company / Firm Name */}
                  {contact.applicantType === "agent" && (
                    <div className="form-row">
                      <label className="f-label">Company / Firm Name</label>
                      <input className="f-input" type="text" placeholder="e.g. Smith & Partners Conveyancing" value={contact.companyName} onChange={e => setContact(p => ({...p, companyName: e.target.value}))}/>
                    </div>
                  )}

                  {/* OC Certificate Reference — optional, OC orders only */}
                  {orderCategory !== "keys" && (
                    <div className="form-row">
                      <label className="f-label">OC Certificate Reference (if required)</label>
                      <input className="f-input" type="text" placeholder="e.g. Ref-2024-001 (optional)" value={contact.ocReference} onChange={e => setContact(p => ({...p, ocReference: e.target.value}))}/>
                      <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>Your internal reference number for this order, if applicable. For order tracking purposes only.</p>
                    </div>
                  )}

                  {/* Authority document — always shown; required for all applicant types */}
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label className="f-label">
                      {contact.applicantType === "owner" ? "Levy Notice / Identity Proof" : "Lot Authority Document"}
                      <span style={{ color: "var(--red)" }}> *</span>
                    </label>
                    <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "8px" }}>
                      {contact.applicantType === "agent"
                        ? "Required. Upload a document proving your authority to act for this lot (e.g. authority to act, letter of engagement, power of attorney)."
                        : contact.applicantType === "owner"
                          ? "Required. Upload your levy notice or levy certificate to verify ownership of this lot."
                          : "Required. Upload a document proving your entitlement to this lot (e.g. levy notice, levy certificate, or lot entitlement certificate)."}
                    </p>
                    <div style={{ position: "relative" }}>
                      {lotAuthFile ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--sage-tint)" }}>
                          <Ic n="doc" s={16}/>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "0.82rem", fontWeight: 500 }}>{lotAuthFile.name}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{(lotAuthFile.size / 1024).toFixed(1)} KB</div>
                          </div>
                          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: "4px" }} onClick={() => setLotAuthFile(null)} title="Remove file"><Ic n="trash" s={15}/></button>
                        </div>
                      ) : (
                        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "1.5rem", border: "2px dashed var(--border)", borderRadius: "4px", cursor: "pointer", textAlign: "center", transition: "border-color 0.15s" }} onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--sage)"; }} onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }} onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; if (e.dataTransfer.files[0]) setLotAuthFile(e.dataTransfer.files[0]); }}>
                          <Ic n="upload" s={24}/>
                          <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--forest)" }}>Click to upload or drag & drop</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>PDF, JPG, PNG — max 10 MB</span>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setLotAuthFile(e.target.files[0]); }}/>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const visibleProducts = plan.products.filter(p => (p.category || "oc") === orderCategory);
                return (<>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2rem 0 1rem" }}>
                    <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--forest)" }}>
                      {orderCategory === "keys" ? "Keys / Fobs / Remotes" : "Available Products"}
                    </h2>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 500 }}>{visibleProducts.length} items · incl. GST</span>
                  </div>
                  {orderCategory === "keys" && (
                    <div className="alert" style={{ background: "#f0f7f3", border: "1px solid #c0dbc9", borderRadius: "6px", padding: "10px 14px", marginBottom: "1rem", fontSize: "0.8rem", color: "var(--forest)" }}>
                      <Ic n="key" s={14}/> <strong>Invoice-based ordering:</strong> Prices shown are indicative. After you submit, we'll review and email you a formal invoice. Your order will be fulfilled upon payment.
                    </div>
                  )}
                  <div className="prod-grid" style={{ marginBottom: "2rem" }}>
                    {visibleProducts.map(product => {
                      const cartItem = orderCategory === "keys" ? cart.find(i => i.productId === product.id && i.lotId === selLot) : null;
                      const allAdded = orderCategory === "keys"
                        ? !!cartItem
                        : product.perOC
                          ? lot.ownerCorps.every(ocId => inCart(product.id, ocId))
                          : inCart(product.id, null);
                      const hasMultiOC = product.perOC && lot.ownerCorps.length > 1;
                      const multiTotal = product.price + (lot.ownerCorps.length - 1) * (product.secondaryPrice ?? product.price);
                      const qty = cartItem?.qty || 1;
                      return (
                        <div key={product.id} className={`prod-card ${allAdded ? "added" : ""}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                            <div className="prod-name">{product.name}</div>
                            {product.perOC && (
                              <div className="tip-wrap">
                                <span className="per-oc-tag">
                                  Per OC <span className="tip-icon"><Ic n="info" s={11}/></span>
                                </span>
                                <div className="tip-box">Charged per Owner Corporation. If your lot belongs to multiple OCs, each is issued a separate certificate — 1st OC at full price, additional OCs at a reduced rate.</div>
                              </div>
                            )}
                          </div>
                          <div className="prod-desc">{product.description}</div>
                          {product.turnaround && <div className="prod-turna">⏱ {product.turnaround}</div>}
                          <div className="prod-foot">
                            <div>
                              <div className="prod-price">{fmt(product.price)} <span style={{fontSize:"0.65rem",fontWeight:400,color:"var(--muted)",fontFamily:"Inter,sans-serif"}}>incl. GST{orderCategory === "keys" ? " (indicative)" : ""}</span></div>
                              {product.perOC && product.secondaryPrice && (
                                <div className="prod-price-tier">Additional OC: {fmt(product.secondaryPrice)}</div>
                              )}
                              {hasMultiOC && (
                                <div className="prod-price-sub">×{lot.ownerCorps.length} OCs = {fmt(multiTotal)} total</div>
                              )}
                            </div>
                            {orderCategory === "keys" ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {allAdded ? (<>
                                  <button style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", width: "28px", height: "28px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => {
                                      if (qty <= 1) { setCart(p => p.filter(i => !(i.productId === product.id && i.lotId === selLot))); }
                                      else { setCart(p => p.map(i => i.productId === product.id && i.lotId === selLot ? { ...i, qty: i.qty - 1, price: product.price * (i.qty - 1) } : i)); }
                                    }}>−</button>
                                  <span style={{ minWidth: "24px", textAlign: "center", fontWeight: 600, fontSize: "0.9rem" }}>{qty}</span>
                                  <button style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", width: "28px", height: "28px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                                    onClick={() => setCart(p => p.map(i => i.productId === product.id && i.lotId === selLot ? { ...i, qty: i.qty + 1, price: product.price * (i.qty + 1) } : i))}>+</button>
                                </>) : (
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                    <button className="add-btn" onClick={() => {
                                      const key = `${product.id}-null-${selLot}-keys`;
                                      setCart(p => [...p, { key, productId: product.id, productName: product.name, planId: plan.id, planName: plan.name, lotId: selLot, lotNumber: lot.number, ocId: null, ocName: null, price: product.price, turnaround: product.turnaround || "", qty: 1 }]);
                                    }}><Ic n="plus" s={13}/> Add</button>
                                    <div style={{ fontSize: "0.62rem", color: "var(--muted)", textAlign: "center" }}>Qty adjustable after adding</div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              allAdded
                                ? <div className="added-pill"><Ic n="check" s={12}/> Added</div>
                                : <button className="add-btn" onClick={() => addProd(product)}><Ic n="plus" s={13}/> Add</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>);
              })()}
            </>
          )}

          {/* Validation warnings */}
          {selLot && (orderCategory === "keys" || contact.applicantType === "agent") && !lotAuthFile && (
            <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
              <Ic n="shield" s={13}/> {contact.applicantType === "agent" ? "An authorisation document is required when applying as an agent. Please upload it above." : "An authority document is required for all Keys/Fobs/Remotes orders. Please upload it above."}
            </div>
          )}
          {selLot && orderCategory === "oc" && contact.applicantType === "owner" && !lotAuthFile && (
            <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
              <Ic n="shield" s={13}/> A Levy Notice is required when applying as an Owner. Please upload it in the Applicant Details section above.
            </div>
          )}
          {selLot && contact.applicantType === "owner" && !contact.ownerName && (
            <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
              <Ic n="x" s={13}/> Owner Name is required. Please enter it in the Applicant Details section above.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-out" onClick={() => setStep(1)}><Ic n="arrowL" s={14}/> Back</button>
            <button className="btn btn-blk btn-lg"
              disabled={cart.length === 0}
              onClick={() => {
                const hasErr = (contact.applicantType === "owner" && !contact.ownerName) || !lotAuthFile;
                if (hasErr) {
                  setStep2Attempted(true);
                  const el = document.querySelector(".alert-warn");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  return;
                }
                setStep(3);
              }}>
              Review Order ({cart.length}) <Ic n="arrow" s={14}/>
            </button>
          </div>

          {/* Sticky cart footer */}
          {cart.length > 0 && (
            <div className="sticky-cart">
              <div className="sc-left">
                <Ic n="cart" s={18}/>
                <div>
                  <div className="sc-count">{cart.length} item{cart.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="sc-total">{fmt(total)}</div>
                <div className="sc-gst">incl. GST {fmt(gstOf(total))}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: REVIEW CART ── */}
      {step === 3 && (
        <div>
          <h1 className="pg-title">Review Order</h1>
          <p className="pg-sub">Check your selections before entering your details.</p>

          {cart.length === 0 ? (
            <div className="panel empty">
              <div style={{ fontSize: "2rem", marginBottom: "0.8rem" }}>🛒</div>
              <p>Your cart is empty.</p>
              <button className="btn btn-blk" style={{ marginTop: "1rem" }} onClick={() => setStep(2)}>Add Products</button>
            </div>
          ) : (
            <div className="panel">
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.8rem" }}>Order Items</div>
              {cart.map(item => (
                <div key={item.key} className="cart-item">
                  <div className="ci-info">
                    <div className="ci-name">
                      {item.productName}
                      {item.qty && item.qty > 1 && (
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 400, marginLeft: "6px" }}>× {item.qty}</span>
                      )}
                      {item.isSecondaryOC && <span style={{ fontSize: "0.68rem", color: "var(--sage)", marginLeft: "6px", fontWeight: 500 }}>Additional OC rate</span>}
                    </div>
                    <div className="ci-meta">
                      {item.planName} · {item.lotNumber}
                      {item.ocName && <><br/>{item.ocName}</>}
                      <br/>⏱ {item.turnaround}
                    </div>
                  </div>
                  <div className="ci-price">{fmt(item.price)}</div>
                  <button className="ci-rm" onClick={() => setCart(p => p.filter(i => i.key !== item.key))}><Ic n="trash" s={15}/></button>
                </div>
              ))}
              {/* ── Applicant Summary (OC orders only) ── */}
              {orderCategory === "oc" && (contact.ownerName || contact.applicantType === "agent" || contact.ocReference) && (
                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.6rem" }}>Applicant</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--ink)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div><span style={{ color: "var(--muted)", marginRight: "8px" }}>Applying as:</span>{contact.applicantType === "agent" ? "Agent / Representative" : "Owner"}</div>
                    {contact.applicantType === "owner" && contact.ownerName && <div><span style={{ color: "var(--muted)", marginRight: "8px" }}>Owner name:</span>{contact.ownerName}</div>}
                    {contact.applicantType === "agent" && contact.companyName && <div><span style={{ color: "var(--muted)", marginRight: "8px" }}>Company:</span>{contact.companyName}</div>}
                    {contact.ocReference && <div><span style={{ color: "var(--muted)", marginRight: "8px" }}>Reference:</span>{contact.ocReference}</div>}
                    {cart[0]?.lotNumber && <div><span style={{ color: "var(--muted)", marginRight: "8px" }}>Lot:</span>{cart[0].lotNumber}</div>}
                  </div>
                </div>
              )}

              {/* ── Shipping Method Selector (Keys/Fobs orders only — OC certs are delivered by email) ── */}
              {(() => {
                const planShipping = plan?.shippingOptions || [];
                if (orderCategory !== "keys" || planShipping.length === 0) return null;
                return (
                  <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.8rem" }}>Shipping Method</div>
                    {planShipping.map(opt => {
                      const cost = calcShippingCost(opt, cart, plan?.products);
                      const isSelected = selectedShipping?.id === opt.id;
                      return (
                        <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", border: `1px solid ${isSelected ? "var(--sage)" : "var(--border)"}`, borderRadius: "4px", cursor: "pointer", marginBottom: "6px", background: isSelected ? "var(--sage-tint)" : "white" }}>
                          <input type="radio" name="shipping" checked={isSelected} onChange={() => setSelectedShipping({ id: opt.id, name: opt.name, cost, requiresAddress: opt.requiresAddress !== false })} style={{ accentColor: "var(--sage)" }}/>
                          <span style={{ flex: 1, fontSize: "0.88rem" }}>{opt.name}</span>
                          <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{fmt(cost)}</span>
                        </label>
                      );
                    })}
                    {/* Delivery Address — shown for keys orders when a delivery option is selected that requires an address */}
                    {orderCategory === "keys" && selectedShipping && selectedShipping.requiresAddress !== false && (
                      <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                        <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.8rem" }}>Delivery Address</div>
                        <div className="form-row">
                          <label className="f-label">Street Address *</label>
                          <input className="f-input" type="text" placeholder="Street address" value={contact.shippingAddress.street} onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, street: e.target.value}}))}/>
                        </div>
                        <div className="form-row">
                          <label className="f-label">Suburb *</label>
                          <input className="f-input" type="text" placeholder="Suburb" value={contact.shippingAddress.suburb} onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, suburb: e.target.value}}))}/>
                        </div>
                        <div style={{ display: "flex", gap: "12px" }}>
                          <div className="form-row" style={{ flex: 2, marginBottom: 0 }}>
                            <label className="f-label">State *</label>
                            <select className="f-input" value={contact.shippingAddress.state} onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, state: e.target.value}}))}>
                              {["NSW","VIC","QLD","SA","WA","TAS","ACT","NT"].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="form-row" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="f-label">Postcode *</label>
                            <input className="f-input" type="text" maxLength={4} placeholder="Postcode" value={contact.shippingAddress.postcode} onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, postcode: e.target.value}}))}/>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Totals */}
              {shippingCost > 0 && (
                <div className="cart-gst-row" style={{ marginTop: "0.5rem" }}>
                  <span>Shipping — {selectedShipping?.name}</span>
                  <span>{fmt(shippingCost)}</span>
                </div>
              )}
              <div className="cart-gst-row">
                <span>GST (10%) included in total</span>
                <span>{fmt(gstOf(total))}</span>
              </div>
              <div className="cart-grand-row">
                <span className="cart-total-label">Total (AUD, incl. GST)</span>
                <span className="cart-total-amt">{fmt(total)}</span>
              </div>
              {orderCategory === "keys" && (
                <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "var(--muted)", fontStyle: "italic" }}>
                  Note: Key/fob prices are indicative — final amount confirmed on invoice.
                </div>
              )}
            </div>
          )}

          {cart.length > 0 && (
            <div style={{ display: "flex", gap: "10px", marginTop: "1px", flexWrap: "wrap" }}>
              <button className="btn btn-out" onClick={() => setStep(2)}><Ic n="arrowL" s={14}/> Edit</button>
              <button className="btn btn-out" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => { setCart([]); setLotAuthFile(null); setContact(DEFAULT_CONTACT); setSelectedShipping(null); setStep(1); }} title="Cancel order and start again"><Ic n="trash" s={13}/> Cancel</button>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                <button className="btn btn-blk btn-lg" style={{ flex: 1, justifyContent: "center" }}
                  disabled={
                    (orderCategory === "keys" && plan?.shippingOptions?.length > 0 && !selectedShipping) ||
                    (orderCategory === "keys" && selectedShipping && selectedShipping.requiresAddress !== false && (!contact.shippingAddress.street || !contact.shippingAddress.suburb || !contact.shippingAddress.postcode))
                  }
                  onClick={() => {
                    // Pre-populate Full Name from owner name if not yet entered
                    if (contact.applicantType === "owner" && contact.ownerName && !contact.name) {
                      setContact(p => ({ ...p, name: p.ownerName }));
                    }
                    setStep(4);
                  }}>
                  Enter Contact Details <Ic n="arrow" s={14}/>
                </button>
                {orderCategory === "keys" && selectedShipping && selectedShipping.requiresAddress !== false && (!contact.shippingAddress.street || !contact.shippingAddress.suburb || !contact.shippingAddress.postcode) && (
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center" }}>Please enter your delivery address above to continue.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: CONTACT DETAILS ── */}
      {step === 4 && (
        <div style={{ maxWidth: "520px" }}>
          <h1 className="pg-title">Contact Details</h1>
          <p className="pg-sub">We'll send your order confirmation and {orderCategory === "keys" ? "invoice" : "certificate"} to these details.</p>
          {(() => {
            const turnarounds = [...new Set(cart.map(i => i.turnaround).filter(Boolean))];
            if (turnarounds.length === 0) return null;
            return <div style={{ fontSize: "0.78rem", color: "var(--sage)", background: "var(--sage-tint)", border: "1px solid var(--border2)", borderRadius: "6px", padding: "8px 12px", marginBottom: "1rem" }}>⏱ Estimated turnaround: {turnarounds.join(" / ")}</div>;
          })()}

          <div className="panel">
            <div className="form-row">
              <label className="f-label">Full Name *</label>
              <input className="f-input" type="text" placeholder={contact.ownerName || "Jane Smith"} value={contact.name} onChange={e => setContact(p => ({...p, name: e.target.value}))} onBlur={() => setNameTouched(true)}/>
              {nameTouched && !contact.name && (
                <div className="f-err"><Ic n="x" s={12}/> Full name is required.</div>
              )}
            </div>
            <div className="form-row">
              <label className="f-label">Email Address *</label>
              <input
                className={`f-input ${emailTouched && contact.email && !emailValid ? "err" : ""}`}
                type="email"
                placeholder="jane@example.com"
                value={contact.email}
                onChange={e => setContact(p => ({...p, email: e.target.value}))}
                onBlur={() => setEmailTouched(true)}
              />
              {emailTouched && contact.email && !emailValid && (
                <div className="f-err"><Ic n="x" s={12}/> Please enter a valid email address.</div>
              )}
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label className="f-label">Phone Number *</label>
              <input
                className={`f-input ${phoneTouched && (!contact.phone || !phoneValid) ? "err" : ""}`}
                type="tel"
                placeholder="0400 000 000"
                value={contact.phone}
                onChange={e => setContact(p => ({...p, phone: e.target.value}))}
                onBlur={() => setPhoneTouched(true)}
              />
              {phoneTouched && !contact.phone && (
                <div className="f-err"><Ic n="x" s={12}/> Phone number is required.</div>
              )}
              {phoneTouched && contact.phone && !phoneValid && (
                <div className="f-err"><Ic n="x" s={12}/> Please enter a valid Australian phone number (e.g. 0400 000 000).</div>
              )}
            </div>

          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "1px" }}>
            <button className="btn btn-out" onClick={() => setStep(3)}><Ic n="arrowL" s={14}/> Back</button>
            {orderCategory === "keys" ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                {keysPlaceErr && <div className="alert alert-warn" style={{ margin: 0 }}>{keysPlaceErr}</div>}
                <button
                  className="btn btn-blk btn-lg"
                  style={{ flex: 1, justifyContent: "center" }}
                  disabled={
                    !contact.name || !contact.email || !emailValid || !contact.phone || !phoneValid || keysPlacing
                  }
                  onClick={async () => { setKeysPlaceErr(""); setKeysPlacing(true); await placeOrder(setKeysPlacing, setKeysPlaceErr); }}
                >
                  {keysPlacing ? "Submitting…" : <> Submit Order <Ic n="check" s={14}/></>}
                </button>
              </div>
            ) : (
              <div style={{ flex: 1 }} onClick={() => {
                if (!contact.name || !contact.email || !emailValid || !contact.phone || !phoneValid) {
                  setNameTouched(true);
                  setPhoneTouched(true);
                  setEmailTouched(true);
                }
              }}>
                <button
                  className="btn btn-blk btn-lg"
                  style={{ flex: 1, justifyContent: "center", width: "100%" }}
                  disabled={!contact.name || !contact.email || !emailValid || !contact.phone || !phoneValid}
                  onClick={() => setStep(5)}
                >
                  Choose Payment <Ic n="arrow" s={14}/>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 5: PAYMENT ── */}
      {step === 5 && orderCategory !== "keys" && (
        <PaymentStep
          cart={cart} total={total} contact={contact}
          payMethod={payMethod} setPayMethod={setPayMethod}
          onBack={() => setStep(4)} placeOrder={placeOrder} pubConfig={pubConfig}
          selectedShipping={selectedShipping} orderCategory={orderCategory}
        />
      )}

      {/* ── STEP 6: CONFIRMATION ── */}
      {step === 6 && stripeConfirming && (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <div style={{ display:"inline-block", animation:"spin 1s linear infinite", border:"3px solid rgba(28,51,38,0.15)", borderTop:"3px solid var(--forest)", borderRadius:"50%", width:48, height:48, marginBottom:"1.5rem" }}/>
          <p style={{ color:"var(--forest)", fontFamily:"'Cormorant Garamond',serif", fontSize:"1.4rem" }}>Confirming your payment…</p>
          <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Please wait while we verify your payment with Stripe.</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {step === 6 && stripeConfirmErr && (
        <div style={{ maxWidth: "500px", textAlign: "center", padding: "3rem 0" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>⚠️</div>
          <h2 style={{ color:"var(--forest)", fontFamily:"'Cormorant Garamond',serif" }}>Payment Verification Issue</h2>
          <p style={{ color:"var(--muted)", fontSize:"0.88rem" }}>{stripeConfirmErr}</p>
          <p style={{ fontSize:"0.82rem", color:"var(--muted)" }}>Your order may have been recorded. Please quote order ID: <strong style={{ fontFamily:"monospace" }}>{stripeOrderId}</strong> when contacting support.</p>
          <a href="mailto:info@tocs.co" className="btn btn-sage" style={{ display:"inline-flex", marginTop:"1rem" }}>Contact Support</a>
        </div>
      )}
      {step === 6 && order && !stripeConfirming && !stripeConfirmErr && (
        <ConfirmationPage order={order} reset={reset} pubConfig={pubConfig} />
      )}

      {/* ── Global footer (visible on steps 1–5, hidden on confirmation) ── */}
      {step < 6 && (
        <div style={{ textAlign:"center", padding:"2rem 0 0.5rem", marginTop:"3rem", borderTop:"1px solid var(--border)", fontSize:"0.75rem", color:"var(--muted)" }}>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--muted)", textDecoration:"underline" }}>Privacy Policy</a>
          {" · "}Top Owners Corporation Solution
        </div>
      )}

      {/* Mobile lot picker modal */}
      {showLotModal && plan && (
        <div className="overlay" onClick={() => setShowLotModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
              <h2 className="modal-tt" style={{ marginBottom: 0 }}>Select a Lot</h2>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }} onClick={() => setShowLotModal(false)}><Ic n="x" s={20}/></button>
            </div>
            <div className="lot-cards">
              {plan.lots.map(l => (
                <div
                  key={l.id}
                  className={`lot-card ${selLot === l.id ? "sel" : ""}`}
                  onClick={() => { if (l.id !== selLot) { setCart([]); setLotAuthFile(null); } setSelLot(l.id); setShowLotModal(false); }}
                >
                  <div className="lc-num">{l.number}</div>
                  <div className="lc-detail">{l.level}</div>
                  <div className="lc-type">{l.type}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAYMENT STEP ─────────────────────────────────────────────────────────────
function PaymentStep({ cart, total, contact, payMethod, setPayMethod, onBack, placeOrder, pubConfig, selectedShipping, orderCategory }) {
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState("");

  const handleConfirm = async () => {
    if (placing) return;
    setPlaceErr("");
    setPlacing(true);
    await placeOrder(setPlacing, setPlaceErr);
  };

  return (
    <div className="payment-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px", alignItems: "start" }}>
      <div>{/* left column */}
      <h1 className="pg-title">Payment</h1>
      <p className="pg-sub">Choose your preferred payment method to complete the order.</p>
      {(() => {
        const turnarounds = [...new Set(cart.map(i => i.turnaround).filter(Boolean))];
        if (turnarounds.length === 0) return null;
        return <div style={{ fontSize: "0.78rem", color: "var(--sage)", background: "var(--sage-tint)", border: "1px solid var(--border2)", borderRadius: "6px", padding: "8px 12px", marginBottom: "1rem" }}>⏱ Estimated turnaround: {turnarounds.join(" / ")}</div>;
      })()}

      <div style={{ border: "1px solid var(--border)", padding: "1.2rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "3px" }}>
        <div>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>Order Total (incl. GST)</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem", fontWeight: 700, color: "var(--forest)" }}>{fmt(total)}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>GST component: {fmt(gstOf(total))}</div>
          {selectedShipping?.cost > 0 && (
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>Shipping ({selectedShipping.name}): {fmt(selectedShipping.cost)}</div>
          )}
          {orderCategory === "keys" && (
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px", fontStyle: "italic" }}>Key/fob prices are indicative — final amount confirmed on invoice.</div>
          )}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", textAlign: "right" }}>
          {cart.length} item{cart.length !== 1 ? "s" : ""}<br/>{contact.name}
        </div>
      </div>

      <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "1rem" }}>Payment Method</div>

      {[
        { id: "bank",   icon: <Ic n="bank" s={20}/>,   name: "Direct Bank Transfer",        desc: "Manual transfer — processing begins on receipt. No fees.", enabled: true },
        { id: "stripe", icon: <Ic n="credit" s={20}/>, name: "Credit / Debit Card (Stripe)", desc: "Secure online card payment. Visa, Mastercard, Amex.", enabled: !!pubConfig?.stripeEnabled },
        { id: "payid",  icon: <span style={{fontWeight:800,fontSize:"0.7rem",letterSpacing:"0.05em"}}>PayID</span>, name: "PayID", desc: "Instant bank transfer via PayID. No transaction fees.", enabled: true },
      ].filter(m => m.enabled).map(m => (
        <div
          key={m.id}
          className={`pay-method ${payMethod === m.id ? "sel" : ""} ${m.id === "stripe" ? "no-print" : ""}`}
          onClick={() => setPayMethod(m.id)}
        >
          <div className="pm-icon">{m.icon}</div>
          <div style={{ flex: 1 }}>
            <div className="pm-name">{m.name}</div>
            <div className="pm-desc">{m.desc}</div>
          </div>
          <div className={`radio-ring ${payMethod === m.id ? "sel" : ""}`}/>
        </div>
      ))}
      {!pubConfig?.stripeEnabled && (
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", background: "var(--sand)", border: "1px solid var(--border2)", borderRadius: "6px", padding: "10px 14px", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1rem" }}>💳</span>
          <span>Card payment is temporarily unavailable. Please use bank transfer or PayID.</span>
        </div>
      )}

      {payMethod === "bank" && (
        <div className="bank-box">
          <div style={{ fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "10px" }}>Bank Account Details</div>
          {[["Account Name", pubConfig?.paymentDetails?.accountName || "Top Owners Corporation"],["BSB", pubConfig?.paymentDetails?.bsb || "033-065"],["Account No.", pubConfig?.paymentDetails?.accountNumber || "522011"],["Reference","Use your order number after placing"]].map(([l,v]) => (
            <div key={l} className="bank-row"><span className="bl">{l}</span><span className="bv">{v}</span></div>
          ))}
        </div>
      )}
      {payMethod === "payid" && (
        <div className="bank-box">
          <div className="bank-row"><span className="bl">PayID</span><span className="bv">{pubConfig?.paymentDetails?.payid || "accounts@tocs.com.au"}</span></div>
          <div className="bank-row"><span className="bl">Type</span><span className="bv">Email</span></div>
          <div className="bank-row"><span className="bl">Reference</span><span className="bv">Use your order number after placing</span></div>
        </div>
      )}

      {placeErr && (
        <div className="alert alert-err" style={{ marginTop: "1rem" }}>{placeErr}</div>
      )}

      <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
        <button className="btn btn-out" onClick={onBack}><Ic n="arrowL" s={14}/> Back</button>
        <button
          className="btn btn-sage btn-lg"
          style={{ flex: 1, justifyContent: "center" }}
          disabled={placing}
          onClick={handleConfirm}
        >
          {placing
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Processing…</>
            : <>Confirm Order <Ic n="arrow" s={14}/></>
          }
        </button>
      </div>
      {placing && (
        <p style={{ fontSize:"0.78rem", color:"var(--sage)", textAlign:"center", marginTop:"0.75rem", fontStyle:"italic" }}>
          Saving your order and sending confirmation email — this may take up to 15 seconds…
        </p>
      )}
      {!placing && (
        <p style={{ fontSize:"0.72rem", color:"var(--muted)", textAlign:"center", marginTop:"0.75rem" }}>
          By placing your order, you agree to our{" "}
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--sage)", textDecoration:"underline" }}>Privacy Policy</a>.
        </p>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>{/* end left column */}
      {/* right column — order summary */}
      <div style={{ background: "var(--sage-tint)", border: "1.5px solid var(--border2)", borderRadius: "10px", padding: "20px", position: "sticky", top: "20px" }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage)", marginBottom: "14px" }}>Order Summary</div>
        {cart.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "8px", gap: "8px" }}>
            <span style={{ color: "var(--ink)" }}>
              {item.productName}{item.qty && item.qty > 1 ? ` × ${item.qty}` : ""}
            </span>
            <span style={{ color: "var(--forest)", fontWeight: 600, flexShrink: 0 }}>{fmt(item.price)}</span>
          </div>
        ))}
        {selectedShipping && selectedShipping.cost > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "8px" }}>
            <span style={{ color: "var(--muted)" }}>{selectedShipping.label}</span>
            <span style={{ color: "var(--forest)", fontWeight: 600 }}>{fmt(selectedShipping.cost)}</span>
          </div>
        )}
        <div style={{ borderTop: "1px solid var(--border2)", marginTop: "10px", paddingTop: "10px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.88rem" }}>
          <span style={{ color: "var(--forest)" }}>Total (incl. GST)</span>
          <span style={{ color: "var(--forest)" }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIRMATION PAGE ────────────────────────────────────────────────────────
function ConfirmationPage({ order, reset, pubConfig }) {
  const [copied, setCopied] = useState(false);

  const copyOrderId = () => {
    navigator.clipboard.writeText(order.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = order.id;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const printReceipt = () => window.print();

  const gst = gstOf(order.total);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: "2rem 0 1rem" }}>
        <div className="success-ring"><Ic n="check" s={36}/></div>
        <h1 className="pg-title" style={{ fontSize: "2.2rem" }}>Order Confirmed</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "0.5rem 0 1.5rem" }}>
          Thank you, {order.contactInfo.name}. Your request has been received.
        </p>
        {(() => {
          const ci = order.contactInfo;
          const t = getApplicantType(ci);
          if (t === "agent" && ci.companyName) return <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>{ci.companyName}</p>;
          if (t === "owner" && ci.ownerName) return <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>{ci.ownerName}</p>;
          return null;
        })()}
      </div>

      <div className="panel" style={{ marginBottom: "1px" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>Save your order reference number</div>
        <div className="order-code-wrap">
          <div className="order-code">{order.id}</div>
          <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyOrderId} title={copied ? "Copied!" : "Copy to clipboard"}>
            {copied ? <Ic n="check" s={18}/> : <Ic n="copy" s={18}/>}
          </button>
        </div>
        {copied && <div style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--ok)", marginBottom: "4px" }}>Copied to clipboard!</div>}
        {order.lotAuthFileName && (
          <div style={{ marginTop: "10px", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--sage-tint)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Ic n="doc" s={15}/>
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 500 }}>Lot Authority Document</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{order.lotAuthFileName}</div>
            </div>
          </div>
        )}

        {order.orderCategory === "keys" ? (
          <div className="alert alert-ok" style={{ marginTop: "1rem" }}>
            <Ic n="invoice" s={14}/> <strong>Invoice will follow.</strong> Our team will review your order and send a formal invoice to <strong>{order.contactInfo.email}</strong>. Fulfilment begins upon receipt of payment.
          </div>
        ) : order.payment === "bank" ? (
          <div className="alert alert-warn" style={{ marginTop: "1rem" }}>
            Please transfer <strong>{fmt(order.total)}</strong> and use <strong>{order.id}</strong> as your payment reference. Certificate processing begins on receipt of funds.
          </div>
        ) : (
          <div className="alert alert-ok" style={{ marginTop: "1rem" }}>
            Payment received. Your certificate(s) will be processed within the stated turnaround time.
          </div>
        )}

        {order.orderCategory !== "keys" && order.payment === "bank" && (
          <div className="bank-box" style={{ marginTop: "0.5rem" }}>
            {[["Account Name", pubConfig?.paymentDetails?.accountName || "Top Owners Corporation"],["BSB", pubConfig?.paymentDetails?.bsb || "033-065"],["Account No.", pubConfig?.paymentDetails?.accountNumber || "522011"],["Reference",order.id]].map(([l,v]) => (
              <div key={l} className="bank-row"><span className="bl">{l}</span><span className="bv">{v}</span></div>
            ))}
          </div>
        )}
        {order.orderCategory !== "keys" && order.payment === "payid" && (
          <div className="bank-box" style={{ marginTop: "0.5rem" }}>
            {[["PayID", pubConfig?.paymentDetails?.payid || "accounts@tocs.com.au"],["Reference",order.id]].map(([l,v]) => (
              <div key={l} className="bank-row"><span className="bl">{l}</span><span className="bv">{v}</span></div>
            ))}
          </div>
        )}
        {order.contactInfo?.shippingAddress?.street && (
          <div style={{ marginTop: "1rem", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--sage-tint)" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>Delivery Address</div>
            <div style={{ fontSize: "0.82rem" }}>{order.contactInfo.shippingAddress.street}</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{order.contactInfo.shippingAddress.suburb} {order.contactInfo.shippingAddress.state} {order.contactInfo.shippingAddress.postcode}</div>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: "1px" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.8rem" }}>Order Summary</div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "1rem" }}>
          <Ic n="mail" s={13}/> A confirmation email has been sent to <strong style={{ color: "var(--ink)" }}>{order.contactInfo.email}</strong>
        </div>
        {order.items.map(item => (
          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem", padding: "6px 0", borderBottom: "1px solid var(--border2)" }}>
            <span>
              {item.productName} · {item.lotNumber}
              {item.ocName ? ` · ${item.ocName}` : ""}
              {item.isSecondaryOC ? <span style={{fontSize:"0.68rem",color:"var(--sage)",marginLeft:"4px"}}>Additional OC</span> : ""}
            </span>
            <strong>{fmt(item.price)}</strong>
          </div>
        ))}
        {order.selectedShipping?.cost > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
            <span>Shipping — {order.selectedShipping.name}</span><span>{fmt(order.selectedShipping.cost)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)", padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
          <span>GST (10%) included</span><span>{fmt(gst)}</span>
        </div>
        <div className="cart-grand-row">
          <span className="cart-total-label">Total (incl. GST)</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.5rem", fontWeight: 600, color: "var(--forest)" }}>{fmt(order.total)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "1px" }} className="no-print">
        <button className="btn btn-out" onClick={printReceipt} style={{ gap: "8px" }}>
          <Ic n="print" s={15}/> Print / Save Receipt
        </button>
        <button className="btn btn-blk btn-lg" style={{ flex: 1, justifyContent: "center" }} onClick={reset}>Place Another Order</button>
      </div>
    </div>
  );
}

// ─── PRIVACY POLICY PAGE ──────────────────────────────────────────────────────
function PrivacyPolicy({ onBack }) {  // pubConfig not needed — logo is in the shared header above <main>
  const sections = [
    {
      heading: "Introduction",
      body: `Top Owners Corporation Solution ("TOCS", "we", "our", "us") is committed to providing quality services to you and this policy outlines our ongoing obligations to you in respect of how we manage your Personal Information.\n\nWe have adopted the Australian Privacy Principles (APPs) contained in the Privacy Act 1988 (Cth) (the Privacy Act). The APPs govern the way in which we collect, use, disclose, store, secure and dispose of your Personal Information.\n\nA copy of the Australian Privacy Principles may be obtained from the website of The Office of the Australian Information Commissioner at www.oaic.gov.au.`,
    },
    {
      heading: "What is Personal Information and why do we collect it?",
      body: `Personal Information is information or an opinion that identifies an individual. Examples of Personal Information we collect include: names, addresses, email addresses, phone numbers, lot and property ownership details.\n\nThis Personal Information is obtained in many ways including correspondence, by telephone, by email, via our website and from third parties. We don't guarantee website links or policy of authorised third parties.\n\nWe collect your Personal Information for the primary purpose of providing our services to you, providing information to our clients and marketing. We may also use your Personal Information for secondary purposes closely related to the primary purpose, in circumstances where you would reasonably expect such use or disclosure. You may unsubscribe from our mailing/marketing lists at any time by contacting us in writing.\n\nWhen we collect Personal Information we will, where appropriate and where possible, explain to you why we are collecting the information and how we plan to use it.`,
    },
    {
      heading: "Sensitive Information",
      body: `Sensitive information is defined in the Privacy Act to include information or opinion about such things as an individual's racial or ethnic origin, political opinions, membership of a political association, religious or philosophical beliefs, membership of a trade union or other professional body, criminal record or health information.\n\nSensitive information will be used by us only:\n• For the primary purpose for which it was obtained\n• For a secondary purpose that is directly related to the primary purpose\n• With your consent; or where required or authorised by law.`,
    },
    {
      heading: "Third Parties",
      body: `Where reasonable and practicable to do so, we will collect your Personal Information only from you. However, in some circumstances we may be provided with information by third parties. In such a case we will take reasonable steps to ensure that you are made aware of the information provided to us by the third party.\n\nWe will only disclose your personal information to relevant strata managers, government bodies, or service providers where necessary to fulfil your OC Certificate order.`,
    },
    {
      heading: "Disclosure of Personal Information",
      body: `Your Personal Information may be disclosed in a number of circumstances including the following:\n• Third parties where you consent to the use or disclosure\n• Where required or authorised by law\n\nWe do not sell, trade, or rent your Personal Information to third parties.`,
    },
    {
      heading: "Security of Personal Information",
      body: `Your Personal Information is stored in a manner that reasonably protects it from misuse and loss and from unauthorised access, modification or disclosure.\n\nWhen your Personal Information is no longer needed for the purpose for which it was obtained, we will take reasonable steps to destroy or permanently de-identify your Personal Information. However, most of the Personal Information is or will be stored in client files which will be kept by us for a minimum of 7 years.`,
    },
    {
      heading: "Access to your Personal Information",
      body: `You may access the Personal Information we hold about you and to update and/or correct it, subject to certain exceptions. If you wish to access your Personal Information, please contact us in writing.\n\nTop Owners Corporation Solution will not charge any fee for your access request, but may charge an administrative fee for providing a copy of your Personal Information.\n\nIn order to protect your Personal Information we may require identification from you before releasing the requested information.`,
    },
    {
      heading: "Maintaining the Quality of your Personal Information",
      body: `It is important to us that your Personal Information is up to date. We will take reasonable steps to make sure that your Personal Information is accurate, complete and up-to-date. If you find that the information we have is not up to date or is inaccurate, please advise us as soon as practicable so we can update our records and ensure we can continue to provide quality services to you.`,
    },
    {
      heading: "Policy Updates",
      body: `This Policy may change from time to time and is available on our website. We encourage you to check our website periodically for updates to this Privacy Policy.`,
    },
    {
      heading: "Privacy Policy Complaints and Enquiries",
      body: `If you have any queries or complaints about our Privacy Policy please contact us at:\n\nTop Owners Corporation Solution\nSydney, NSW, Australia\nEmail: info@tocs.co`,
    },
  ];

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 0 4rem" }}>
      <button className="btn btn-out" style={{ marginBottom: "2rem", display: "inline-flex", gap: "6px" }} onClick={onBack}>
        ← Back
      </button>

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.5rem", fontWeight: 600, color: "var(--forest)", marginBottom: "0.5rem" }}>
        Privacy Policy
      </h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "2.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem" }}>
        Top Owners Corporation Solution · Last updated: March 2026
      </p>

      {sections.map(({ heading, body }) => (
        <div key={heading} style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, color: "var(--forest)", marginBottom: "0.6rem", borderBottom: "1px solid var(--border2)", paddingBottom: "0.4rem" }}>
            {heading}
          </h2>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.75, color: "var(--ink)", whiteSpace: "pre-line", margin: 0 }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function Admin({ data, setData, adminTab, setAdminTab, adminToken, setAdminToken, pubConfig, setPubConfig }) {

  // ── All hooks MUST be declared before any conditional return (Rules of Hooks) ─
  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [planId, setPlanId] = useState(data.strataPlans[0]?.id || "");
  const [form, setForm] = useState({});
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderFilter, setOrderFilter] = useState({ text: "", status: "", category: "", plan: "", lot: "" });
  const [sendCertModal, setSendCertModal] = useState(null); // { orderId, order }
  const [sendInvoiceModal, setSendInvoiceModal] = useState(null); // { orderId, order }
  const [cancelOrderModal, setCancelOrderModal] = useState(null); // { orderId, order }
  const [adminToast, setAdminToast] = useState(null);

  const handleAuth = (token, user) => {
    setAdminToken(token);
    try { sessionStorage.setItem("admin_token", token); sessionStorage.setItem("admin_user", user); } catch {}
    // Re-fetch data with admin token to load orders (orders not returned to unauthenticated callers)
    fetch("/api/data", { headers: { "Authorization": "Bearer " + token } })
      .then(r => r.json()).then(d => setData(d)).catch(() => {});
  };
  const handleLogout = () => {
    setAdminToken(null);
    try { sessionStorage.removeItem("admin_token"); sessionStorage.removeItem("admin_user"); } catch {}
  };

  if (!adminToken) return <AdminLogin onAuth={handleAuth} pubConfig={pubConfig} />;
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const plan = data.strataPlans.find(p => p.id === planId);

  const TABS = ["plans", "products", "lots", "ownerCorps", "orders", "settings", "branding", "storage", "security"];

  // ── API helper ──────────────────────────────────────────────────────────────
  const savePlans = async (plans) => {
    setData(p => ({ ...p, strataPlans: plans }));
    try {
      await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ plans }),
      });
    } catch {}
  };

  // ── Plan CRUD ───────────────────────────────────────────────────────────────
  const addPlan = async () => {
    if (!form.id || !form.name) return;
    const plans = [...data.strataPlans, { id: form.id, name: form.name, address: form.address || "", lots: [], ownerCorps: {}, products: [], active: true }];
    await savePlans(plans);
    setModal(null); setForm({});
  };

  const openEditPlan = (p) => {
    setEditTarget({ type: "plan", id: p.id });
    setForm({ name: p.name, address: p.address });
    setModal("editPlan");
  };

  const savePlan = async () => {
    if (!form.name) return;
    const plans = data.strataPlans.map(p => p.id !== editTarget.id ? p : { ...p, name: form.name, address: form.address || "" });
    await savePlans(plans);
    setModal(null); setForm({}); setEditTarget(null);
  };

  const deletePlan = async (id) => {
    if (!window.confirm("Delete this strata plan and all its lots, products and Owner Corporations? This cannot be undone.")) return;
    const plans = data.strataPlans.filter(p => p.id !== id);
    await savePlans(plans);
    if (planId === id) setPlanId(plans[0]?.id || "");
  };

  // ── Product CRUD ────────────────────────────────────────────────────────────
  const buildShippingCosts = () => {
    const opts = plan?.shippingOptions || [];
    const sc = {};
    opts.forEach(opt => {
      const val = form[`sc_${opt.id}`];
      if (val !== "" && val !== undefined) sc[opt.id] = Math.max(0, parseFloat(val));
    });
    return Object.keys(sc).length > 0 ? sc : undefined;
  };

  const addProduct = async () => {
    if (!form.name || !form.price) return;
    const shippingCosts = buildShippingCosts();
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, products: [...pl.products, {
        id: "P" + Date.now(), name: form.name, description: form.desc || "",
        price: Math.max(0, parseFloat(form.price)),
        secondaryPrice: form.secondaryPrice ? Math.max(0, parseFloat(form.secondaryPrice)) : undefined,
        turnaround: form.turnaround || "5 business days", perOC: form.perOC === "true",
        category: form.category || "oc",
        ...(shippingCosts ? { shippingCosts } : {}),
      }]
    });
    await savePlans(plans);
    setModal(null); setForm({});
  };

  const saveProduct = async () => {
    if (!form.name || !form.price) return;
    const shippingCosts = buildShippingCosts();
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, products: pl.products.map(pr => pr.id !== editTarget.id ? pr : {
        ...pr, name: form.name, description: form.desc || "",
        price: Math.max(0, parseFloat(form.price)),
        secondaryPrice: form.secondaryPrice ? Math.max(0, parseFloat(form.secondaryPrice)) : undefined,
        turnaround: form.turnaround || "5 business days", perOC: form.perOC === "true",
        category: form.category || "oc",
        ...(shippingCosts ? { shippingCosts } : { shippingCosts: undefined }),
      })
    });
    await savePlans(plans);
    setModal(null); setForm({}); setEditTarget(null);
  };

  const deleteProd = async (pid) => {
    if (!window.confirm("Delete this product?")) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : { ...pl, products: pl.products.filter(pr => pr.id !== pid) });
    await savePlans(plans);
  };

  // ── Shipping Options CRUD ───────────────────────────────────────────────────
  const openManageShipping = (p) => {
    setEditTarget({ type: "plan", id: p.id });
    setForm({});
    setModal("manageShipping");
  };

  const openKeysShipping = (p) => {
    setEditTarget({ type: "plan", id: p.id });
    setForm({
      keysDeliveryCost: p.keysShipping?.deliveryCost ?? 0,
      keysExpressCost:  p.keysShipping?.expressCost  ?? 0,
    });
    setModal("keysShipping");
  };

  const saveKeysShipping = async () => {
    const deliveryCost = Math.max(0, parseFloat(form.keysDeliveryCost) || 0);
    const expressCost  = Math.max(0, parseFloat(form.keysExpressCost)  || 0);
    const plans = data.strataPlans.map(p =>
      p.id !== editTarget.id ? p
        : { ...p, keysShipping: { deliveryCost, expressCost } }
    );
    await savePlans(plans);
    setModal(null);
    setEditTarget(null);
    setForm({});
  };

  const addShippingOption = async () => {
    if (!form.shippingName || form.shippingCost === "" || form.shippingCost === undefined) return;
    const newOpt = { id: "ship-" + Date.now(), name: form.shippingName, cost: Math.max(0, parseFloat(form.shippingCost)), requiresAddress: form.shippingRequiresAddress !== false };
    const plans = data.strataPlans.map(p => p.id !== editTarget.id ? p : { ...p, shippingOptions: [...(p.shippingOptions || []), newOpt] });
    await savePlans(plans);
    setForm(f => ({ ...f, shippingName: "", shippingCost: "", shippingRequiresAddress: true }));
  };

  const deleteShippingOption = async (optId) => {
    const plans = data.strataPlans.map(p => p.id !== editTarget.id ? p : { ...p, shippingOptions: (p.shippingOptions || []).filter(o => o.id !== optId) });
    await savePlans(plans);
  };

  // ── Lot CRUD ────────────────────────────────────────────────────────────────
  const addLot = async () => {
    if (!form.lotNum) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, lots: [...pl.lots, { id: "L" + Date.now(), number: form.lotNum, level: form.level || "", type: form.lotType || "Residential", ownerCorps: form.ocIds ? form.ocIds.split(",").map(s => s.trim()).filter(Boolean) : [] }]
    });
    await savePlans(plans);
    setModal(null); setForm({});
  };

  const saveLot = async () => {
    if (!form.lotNum) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, lots: pl.lots.map(l => l.id !== editTarget.id ? l : {
        ...l, number: form.lotNum, level: form.level || "", type: form.lotType || "Residential",
        ownerCorps: form.ocIds ? form.ocIds.split(",").map(s => s.trim()).filter(Boolean) : [],
      })
    });
    await savePlans(plans);
    setModal(null); setForm({}); setEditTarget(null);
  };

  const deleteLot = async (lid) => {
    if (!window.confirm("Delete this lot?")) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : { ...pl, lots: pl.lots.filter(l => l.id !== lid) });
    await savePlans(plans);
  };

  // ── Owner Corp CRUD ─────────────────────────────────────────────────────────
  const addOC = async () => {
    if (!form.ocId || !form.ocName) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, ownerCorps: { ...pl.ownerCorps, [form.ocId]: { name: form.ocName, levy: form.ocLevy ? parseFloat(form.ocLevy) : 0 } }
    });
    await savePlans(plans);
    setModal(null); setForm({});
  };

  const saveOC = async () => {
    if (!form.ocName) return;
    const plans = data.strataPlans.map(pl => pl.id !== planId ? pl : {
      ...pl, ownerCorps: { ...pl.ownerCorps, [editTarget.id]: { name: form.ocName, levy: form.ocLevy ? parseFloat(form.ocLevy) : 0 } }
    });
    await savePlans(plans);
    setModal(null); setForm({}); setEditTarget(null);
  };

  const deleteOC = async (ocId) => {
    if (!window.confirm(`Delete Owner Corporation "${ocId}"? Lots referencing it will keep the ID but lose the name.`)) return;
    const plans = data.strataPlans.map(pl => {
      if (pl.id !== planId) return pl;
      const oc = { ...pl.ownerCorps };
      delete oc[ocId];
      return { ...pl, ownerCorps: oc };
    });
    await savePlans(plans);
  };

  const openEditOC = (ocId, oc) => {
    setEditTarget({ type: "oc", id: ocId });
    setForm({ ocName: oc.name, ocLevy: oc.levy });
    setModal("editOC");
  };

  // ── Order actions ───────────────────────────────────────────────────────────
  const showAdminToast = (type, msg) => {
    setAdminToast({ type, msg });
    setTimeout(() => setAdminToast(null), 4000);
  };

  const updateOrderStatus = async (oid, status) => {
    // Capture previous status for rollback
    const prev = data.orders.find(o => o.id === oid)?.status;
    // Optimistic update
    setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status }) }));
    try {
      const r = await fetch(`/api/orders/${oid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        // Revert optimistic update
        setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status: prev }) }));
        showAdminToast("err", d.error || `Failed to update status to "${status}".`);
      }
    } catch {
      // Revert on network error
      setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status: prev }) }));
      showAdminToast("err", "Network error — status update was not saved.");
    }
  };
  const markPaid      = (oid) => updateOrderStatus(oid, "Paid");
  const openEditLot = (lot) => {
    setEditTarget({ type: "lot", id: lot.id });
    setForm({ lotNum: lot.number, level: lot.level, lotType: lot.type, ocIds: lot.ownerCorps.join(", ") });
    setModal("editLot");
  };

  const openEditProduct = (prod) => {
    setEditTarget({ type: "product", id: prod.id });
    const scFields = {};
    if (prod.shippingCosts) {
      Object.entries(prod.shippingCosts).forEach(([k, v]) => { scFields[`sc_${k}`] = v; });
    }
    setForm({ name: prod.name, desc: prod.description, price: prod.price, secondaryPrice: prod.secondaryPrice, turnaround: prod.turnaround, perOC: String(prod.perOC), category: prod.category || "oc", ...scFields });
    setModal("editProduct");
  };

  // ── Excel / CSV import for lots ─────────────────────────────────────────────
  const importLotsFromFile = async (e, targetPlanId) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { alert("The file appears to be empty."); return; }

      // Map columns flexibly (case-insensitive, spaces allowed)
      const norm = s => String(s).toLowerCase().replace(/[\s_\-]/g, "");
      const lots = rows.map((row, idx) => {
        const keys = Object.keys(row);
        const get = (...names) => {
          const k = keys.find(k => names.some(n => norm(k) === norm(n)));
          return k ? String(row[k]).trim() : "";
        };
        const number  = get("Lot Number", "Lot No", "Lot", "Number");
        const level   = get("Level", "Floor");
        const type    = get("Type", "Lot Type", "Use");
        const ocRaw   = get("Owner Corp IDs", "Owner Corp", "OC IDs", "OC", "Owner Corporation");
        const ocIds   = ocRaw ? ocRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
        return { id: "L" + Date.now() + idx, number: number || `Row ${idx + 2}`, level, type: type || "Residential", ownerCorps: ocIds };
      }).filter(l => l.number);

      const confirmed = window.confirm(`Import ${lots.length} lots into ${targetPlanId}?\n\nThis will REPLACE all existing lots for this plan.`);
      if (!confirmed) return;

      const r = await fetch("/api/lots/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ planId: targetPlanId, lots }),
      });
      if (r.ok) {
        setData(p => ({ ...p, strataPlans: p.strataPlans.map(pl => pl.id !== targetPlanId ? pl : { ...pl, lots }) }));
        alert(`✅ ${lots.length} lots imported successfully.`);
      } else {
        const d = await r.json();
        alert("Import failed: " + (d.error || "Unknown error"));
      }
    } catch (err) {
      alert("Failed to read file: " + err.message);
    }
  };

  const adminUser = (() => { try { return sessionStorage.getItem("admin_user") || ""; } catch { return ""; } })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 className="pg-title">Admin</h1>
          <p className="pg-sub" style={{ marginBottom: 0 }}>Manage strata plans, products, lots and view all orders.</p>
        </div>
        <button className="btn btn-out" style={{ gap: "6px", fontSize: "0.72rem" }} onClick={handleLogout}>
          <Ic n="logout" s={14}/> Sign Out
        </button>
      </div>

      <div className="admin-bar">
        {TABS.map(t => (
          <button key={t} className={`at ${adminTab === t ? "act" : ""}`} onClick={() => setAdminTab(t)}>
            {t === "security" && <Ic n="shield" s={13}/>}
            {t === "settings" && <Ic n="settings" s={13}/>}
            {t === "branding" && <Ic n="image" s={13}/>}
            {t === "storage" && <Ic n="cloud" s={13}/>}{" "}
            {t === "ownerCorps" ? "Owner Corps" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── PLANS ── */}
      {adminTab === "plans" && (
        <div className="panel">
          <div className="section-hd">
            <h2 className="section-tt">Strata Plans</h2>
            <button className="btn btn-blk" style={{ padding: "8px 16px", fontSize: "0.72rem" }} onClick={() => { setForm({}); setModal("plan"); }}>
              <Ic n="plus" s={13}/> Add Plan
            </button>
          </div>
          <table className="tbl">
            <thead><tr><th>Plan ID</th><th>Name</th><th>Address</th><th>Lots</th><th>Products</th><th>Shipping</th><th></th></tr></thead>
            <tbody>
              {data.strataPlans.map(p => (
                <tr key={p.id}>
                  <td><strong style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{p.id}</strong></td>
                  <td>{p.name}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)", maxWidth: 180 }}>{p.address}</td>
                  <td>{p.lots.length}</td>
                  <td>{p.products.length}</td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{(p.shippingOptions || []).length} option{(p.shippingOptions || []).length !== 1 ? "s" : ""}</td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    <button className="tbl-act-btn" onClick={() => openEditPlan(p)}><Ic n="edit" s={13}/> Edit</button>
                    <button className="tbl-act-btn" onClick={() => openManageShipping(p)}><Ic n="truck" s={13}/> Shipping</button>
                    <button className="tbl-act-btn danger" onClick={() => deletePlan(p.id)}><Ic n="trash" s={13}/> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PRODUCTS ── */}
      {adminTab === "products" && (
        <div>
          <div style={{ marginBottom: "1px" }}>
            <div className="panel">
              <label className="f-label">Strata Plan</label>
              <select className="f-select" style={{ maxWidth: 320 }} value={planId} onChange={e => setPlanId(e.target.value)}>
                {data.strataPlans.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
              </select>
            </div>
          </div>
          {plan && (
            <div className="panel">
              <div className="section-hd">
                <h2 className="section-tt">Products — {plan.name}</h2>
                <button className="btn btn-blk" style={{ padding: "8px 16px", fontSize: "0.72rem" }} onClick={() => { setForm({}); setModal("product"); }}>
                  <Ic n="plus" s={13}/> Add Product
                </button>
              </div>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Price (incl.GST)</th><th>2nd OC Price</th><th>Turnaround</th><th>Category</th><th>Per OC</th><th></th></tr></thead>
                <tbody>
                  {plan.products.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong><div style={{fontSize:"0.72rem",color:"var(--muted)"}}>{p.description}</div></td>
                      <td>{fmt(p.price)}</td>
                      <td>{p.perOC && p.secondaryPrice ? fmt(p.secondaryPrice) : <span style={{color:"var(--muted)"}}>—</span>}</td>
                      <td style={{ fontSize: "0.78rem" }}>{p.turnaround}</td>
                      <td><span className={`badge ${(p.category || "oc") === "keys" ? "bg-teal" : "bg-gray"}`}>{(p.category || "oc") === "keys" ? "Keys/Fobs" : "OC Certs"}</span></td>
                      <td><span className={`badge ${p.perOC ? "bg-b" : "bg-gray"}`}>{p.perOC ? "Yes" : "No"}</span></td>
                      <td style={{ display: "flex", gap: "6px" }}>
                        <button className="tbl-act-btn" onClick={() => openEditProduct(p)}><Ic n="edit" s={13}/></button>
                        <button className="tbl-act-btn danger" onClick={() => deleteProd(p.id)}><Ic n="trash" s={13}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.products.length === 0 && <div className="empty"><p>No products yet.</p></div>}
            </div>
          )}
        </div>
      )}

      {/* ── LOTS ── */}
      {adminTab === "lots" && (
        <div>
          <div className="panel" style={{ marginBottom: "1px" }}>
            <label className="f-label">Strata Plan</label>
            <select className="f-select" style={{ maxWidth: 320 }} value={planId} onChange={e => setPlanId(e.target.value)}>
              {data.strataPlans.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
            </select>
          </div>
          {plan && (
            <div className="panel">
              <div className="section-hd">
                <h2 className="section-tt">Lots — {plan.name}</h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <label className="btn btn-out" style={{ padding: "8px 16px", fontSize: "0.72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Ic n="upload" s={13}/> Import Excel
                    <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => importLotsFromFile(e, planId)}/>
                  </label>
                  <button className="btn btn-blk" style={{ padding: "8px 16px", fontSize: "0.72rem" }} onClick={() => { setForm({}); setModal("lot"); }}>
                    <Ic n="plus" s={13}/> Add Lot
                  </button>
                </div>
              </div>
              <table className="tbl">
                <thead><tr><th>Lot</th><th>Level</th><th>Type</th><th>Owner Corporations</th><th></th></tr></thead>
                <tbody>
                  {plan.lots.map(l => (
                    <tr key={l.id}>
                      <td><strong>{l.number}</strong></td>
                      <td>{l.level}</td>
                      <td><span className={`badge ${l.type==="Residential"?"bg-b":l.type==="Commercial"?"bg-gold":"bg-gray"}`}>{l.type}</span></td>
                      <td style={{ fontSize: "0.78rem" }}>{l.ownerCorps.map(id => plan.ownerCorps[id]?.name || id).join(", ")}</td>
                      <td style={{ display: "flex", gap: "6px" }}>
                        <button className="tbl-act-btn" onClick={() => openEditLot(l)}><Ic n="edit" s={13}/></button>
                        <button className="tbl-act-btn danger" onClick={() => deleteLot(l.id)}><Ic n="trash" s={13}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.lots.length === 0 && <div className="empty"><p>No lots yet.</p></div>}
            </div>
          )}
        </div>
      )}

      {/* ── OWNER CORPS ── */}
      {adminTab === "ownerCorps" && (
        <div>
          <div className="panel" style={{ marginBottom: "1px" }}>
            <label className="f-label">Strata Plan</label>
            <select className="f-select" style={{ maxWidth: 320 }} value={planId} onChange={e => setPlanId(e.target.value)}>
              {data.strataPlans.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
            </select>
          </div>
          {plan && (
            <div className="panel">
              <div className="section-hd">
                <h2 className="section-tt">Owner Corporations — {plan.name}</h2>
                <button className="btn btn-blk" style={{ padding: "8px 16px", fontSize: "0.72rem" }} onClick={() => { setForm({}); setModal("addOC"); }}>
                  <Ic n="plus" s={13}/> Add Owner Corp
                </button>
              </div>
              <table className="tbl">
                <thead><tr><th>OC ID</th><th>Name</th><th>Lots</th><th></th></tr></thead>
                <tbody>
                  {Object.entries(plan.ownerCorps).map(([ocId, oc]) => {
                    const lotsCount = plan.lots.filter(l => l.ownerCorps.includes(ocId)).length;
                    return (
                      <tr key={ocId}>
                        <td><strong style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{ocId}</strong></td>
                        <td>{oc.name}</td>
                        <td>{lotsCount}</td>
                        <td style={{ display: "flex", gap: "6px" }}>
                          <button className="tbl-act-btn" onClick={() => openEditOC(ocId, oc)}><Ic n="edit" s={13}/></button>
                          <button className="tbl-act-btn danger" onClick={() => deleteOC(ocId)}><Ic n="trash" s={13}/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {Object.keys(plan.ownerCorps).length === 0 && <div className="empty"><p>No Owner Corporations yet.</p></div>}
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS ── */}
      {adminTab === "orders" && (() => {
        const filteredOrders = data.orders.filter(o => {
          const statusOk = !orderFilter.status || o.status === orderFilter.status;
          const categoryOk = !orderFilter.category || (o.orderCategory || "oc") === orderFilter.category;
          const building = o.items?.[0]?.planName || "";
          const lot = o.items?.[0]?.lotNumber || "";
          const planOk = !orderFilter.plan.trim() || building.toLowerCase().includes(orderFilter.plan.trim().toLowerCase()) || (o.items?.[0]?.planId || "").toLowerCase().includes(orderFilter.plan.trim().toLowerCase());
          const lotOk = !orderFilter.lot.trim() || lot.toLowerCase().includes(orderFilter.lot.trim().toLowerCase());
          const txt = orderFilter.text.toLowerCase();
          if (!txt) return statusOk && categoryOk && planOk && lotOk;
          const textOk = (o.id || "").toLowerCase().includes(txt) ||
            (o.contactInfo?.name || "").toLowerCase().includes(txt) ||
            (o.contactInfo?.email || "").toLowerCase().includes(txt) ||
            (o.contactInfo?.companyName || "").toLowerCase().includes(txt) ||
            building.toLowerCase().includes(txt) ||
            lot.toLowerCase().includes(txt);
          return statusOk && categoryOk && planOk && lotOk && textOk;
        });
        return (
        <div className="panel">
          {adminToast && (
            <div className={`alert ${adminToast.type === "err" ? "alert-err" : "alert-ok"}`}
              style={{ marginBottom: "1rem" }}>{adminToast.msg}</div>
          )}
          <div className="section-hd">
            <h2 className="section-tt">Orders</h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className="badge bg-b">{filteredOrders.length}/{data.orders.length}</span>
              {data.orders.length > 0 && (
                <button className="btn btn-out" style={{ padding: "6px 12px", fontSize: "0.72rem" }}
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/orders/export", { headers: { "Authorization": "Bearer " + adminToken } });
                      if (!r.ok) { showAdminToast("err", "Export failed."); return; }
                      const blob = await r.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url; a.download = "orders.csv"; a.click();
                      URL.revokeObjectURL(url);
                    } catch { showAdminToast("err", "Export failed."); }
                  }}>
                  <Ic n="doc" s={13}/> Export CSV
                </button>
              )}
            </div>
          </div>
          {/* Category toggle + Search / filter bar */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {[["", "All Orders"], ["oc", "OC Certificates"], ["keys", "Keys / Fobs"]].map(([val, label]) => (
              <button key={val} onClick={() => setOrderFilter(p => ({ ...p, category: val }))}
                style={{ padding: "5px 14px", borderRadius: "20px", border: "1.5px solid", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  background: orderFilter.category === val ? "var(--forest)" : "transparent",
                  color: orderFilter.category === val ? "#fff" : "var(--forest)",
                  borderColor: orderFilter.category === val ? "var(--forest)" : "var(--border)" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            <input className="f-input" type="text" placeholder="Search name, company, order ID…"
              style={{ flex: "1 1 180px", padding: "6px 10px", fontSize: "0.82rem" }}
              value={orderFilter.text} onChange={e => setOrderFilter(p => ({ ...p, text: e.target.value }))}/>
            <input className="f-input" type="text" placeholder="🏢 Plan / Building…"
              style={{ flex: "1 1 140px", padding: "6px 10px", fontSize: "0.82rem" }}
              value={orderFilter.plan} onChange={e => setOrderFilter(p => ({ ...p, plan: e.target.value }))}/>
            <input className="f-input" type="text" placeholder="🔑 Lot number…"
              style={{ flex: "0 1 120px", padding: "6px 10px", fontSize: "0.82rem" }}
              value={orderFilter.lot} onChange={e => setOrderFilter(p => ({ ...p, lot: e.target.value }))}/>
            <select className="f-select" style={{ flex: "0 0 200px", padding: "6px 10px", fontSize: "0.82rem" }}
              value={orderFilter.status} onChange={e => setOrderFilter(p => ({ ...p, status: e.target.value }))}>
              <option value="">All statuses</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Awaiting Payment</option>
              <option>Awaiting Stripe Payment</option>
              <option>Paid</option>
              <option>Issued</option>
              <option>Cancelled</option>
              <option>Invoice to be issued</option>
              <option>Invoice sent, awaiting payment</option>
            </select>
            {(orderFilter.text || orderFilter.status || orderFilter.category || orderFilter.plan || orderFilter.lot) && (
              <button className="btn btn-out" style={{ padding: "6px 10px", fontSize: "0.78rem" }}
                onClick={() => setOrderFilter({ text: "", status: "", category: "", plan: "", lot: "" })}>Clear</button>
            )}
          </div>
          {filteredOrders.length === 0 ? (
            <div className="empty"><div style={{ fontSize: "2rem", marginBottom: "0.8rem" }}>📋</div><p>{data.orders.length === 0 ? "No orders yet." : "No orders match your filter."}</p></div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Order ID</th><th>Date</th><th>Building / Lot</th><th>Applicant</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filteredOrders.map(o => {
                  const building = o.items?.[0]?.planName || "—";
                  const lotNum = o.items?.[0]?.lotNumber || "—";
                  return (
                  <Fragment key={o.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                      <td><strong style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>{o.id}</strong></td>
                      <td style={{ fontSize: "0.78rem" }}>{new Date(o.date).toLocaleDateString("en-AU")}</td>
                      <td style={{ fontSize: "0.78rem" }}><strong>{building}</strong><br/><span style={{ color: "var(--muted)" }}>{lotNum}</span></td>
                      <td style={{ fontSize: "0.78rem" }}>
                        {o.contactInfo?.name || "—"}
                        {(() => {
                          const ci = o.contactInfo;
                          if (!ci) return null;
                          const t = getApplicantType(ci);
                          if (t === "agent" && ci.companyName) return <><br/><span style={{ color: "var(--sage)", fontSize: "0.72rem" }}>{ci.companyName}</span></>;
                          if (t === "owner" && ci.ownerName) return <><br/><span style={{ color: "var(--sage)", fontSize: "0.72rem" }}>{ci.ownerName}</span></>;
                          return null;
                        })()}
                        <br/><span style={{ color: "var(--muted)" }}>{o.contactInfo?.email}</span>
                      </td>
                      <td>{(o.items || []).length}</td>
                      <td><strong>{fmt(o.total)}</strong></td>
                      <td><span className={`badge ${
                        o.status==="Issued"?"bg-b":
                        o.status==="Cancelled"?"bg-r":
                        o.status==="Paid"?"bg-g":
                        o.status==="Awaiting Stripe Payment"?"bg-purple":
                        o.status==="Invoice sent, awaiting payment"?"bg-slate":
                        o.status==="Invoice to be issued"?"bg-teal":
                        "bg-gold"
                      }`}>{o.status}</span></td>
                      <td style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                        {o.status === "Invoice to be issued" && (
                          <button className="tbl-act-btn" style={{ background:"#e0f5f2",color:"#0d6e62",border:"1px solid #a0d8d2" }} onClick={e => { e.stopPropagation(); setSendInvoiceModal({ orderId: o.id, order: o }); }}>Send Invoice</button>
                        )}
                        {(o.status === "Awaiting Payment" || o.status === "Invoice sent, awaiting payment" || o.status === "Awaiting Stripe Payment") && (
                          <button className="tbl-act-btn success" onClick={e => { e.stopPropagation(); markPaid(o.id); }}>Mark Paid</button>
                        )}
                        {o.status !== "Issued" && o.status !== "Cancelled" && o.orderCategory !== "keys" && (
                          <button className="tbl-act-btn" style={{ background:"#f0fdf4",color:"#16a34a",border:"1px solid #86efac" }} onClick={e => { e.stopPropagation(); setSendCertModal({ orderId: o.id, order: o }); }}>Send Cert</button>
                        )}
                        {o.status !== "Issued" && o.status !== "Cancelled" && (
                          <button className="tbl-act-btn danger" onClick={e => { e.stopPropagation(); setCancelOrderModal({ orderId: o.id, order: o }); }}>Cancel</button>
                        )}
                        {o.status === "Cancelled" && (
                          <button className="tbl-act-btn danger"
                            title="Permanently delete this cancelled order"
                            onClick={e => {
                              e.stopPropagation();
                              if (!window.confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) return;
                              fetch(`/api/orders/${o.id}/delete`, { method: "DELETE", headers: { "Authorization": "Bearer " + adminToken } })
                                .then(r => r.json())
                                .then(d => {
                                  if (d.ok) {
                                    setData(p => ({ ...p, orders: p.orders.filter(x => x.id !== o.id) }));
                                    showAdminToast("ok", `Order ${o.id} deleted.`);
                                  } else {
                                    showAdminToast("err", d.error || "Delete failed.");
                                  }
                                })
                                .catch(() => showAdminToast("err", "Delete failed."));
                            }}>Delete</button>
                        )}
                        {(o.lotAuthFileName || o.lotAuthorityFile || o.lotAuthorityUrl) && (
                          o.lotAuthorityUrl
                            ? <a href={o.lotAuthorityUrl} target="_blank" rel="noreferrer" className="tbl-act-btn" style={{ textDecoration:"none" }} onClick={e => e.stopPropagation()}>📎 Auth Doc</a>
                            : <a href={`/api/orders/${o.id}/authority?token=${adminToken}`} className="tbl-act-btn" style={{ textDecoration:"none" }} download onClick={e => e.stopPropagation()}>📎 Auth Doc</a>
                        )}
                        <Ic n={expandedOrder === o.id ? "arrowL" : "arrow"} s={12}/>
                      </td>
                    </tr>
                    {expandedOrder === o.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "var(--cream)", padding: "0.8rem 1rem" }}>
                          {/* Order Items */}
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>Order Items</div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: "1rem" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                <th style={{ textAlign:"left", padding:"4px 8px", fontWeight:600 }}>Product</th>
                                <th style={{ textAlign:"left", padding:"4px 8px", fontWeight:600 }}>Plan / Lot</th>
                                <th style={{ textAlign:"left", padding:"4px 8px", fontWeight:600 }}>Owner Corp</th>
                                <th style={{ textAlign:"left", padding:"4px 8px", fontWeight:600 }}>Turnaround</th>
                                <th style={{ textAlign:"right", padding:"4px 8px", fontWeight:600 }}>Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map(item => (
                                <tr key={item.key} style={{ borderBottom: "1px solid var(--border2)" }}>
                                  <td style={{ padding:"4px 8px" }}>{item.productName}{item.isSecondaryOC && <span style={{fontSize:"0.68rem",color:"var(--sage)",marginLeft:"4px"}}>Additional OC</span>}</td>
                                  <td style={{ padding:"4px 8px", color:"var(--muted)" }}>{item.planName} · {item.lotNumber}</td>
                                  <td style={{ padding:"4px 8px", color:"var(--muted)" }}>{item.ocName || "—"}</td>
                                  <td style={{ padding:"4px 8px", color:"var(--muted)" }}>⏱ {item.turnaround}</td>
                                  <td style={{ padding:"4px 8px", textAlign:"right" }}><strong>{fmt(item.price)}</strong></td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={4} style={{ padding:"6px 8px", textAlign:"right", fontSize:"0.78rem", color:"var(--muted)" }}>Total (incl. GST)</td>
                                <td style={{ padding:"6px 8px", textAlign:"right", fontFamily:"'Cormorant Garamond',serif", fontSize:"1.1rem", fontWeight:600, color:"var(--forest)" }}>{fmt(o.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                          {/* Customer Details */}
                          {(() => {
                            const ci = o.contactInfo || {};
                            const effectiveType = getApplicantType(ci);
                            const hasExtra = effectiveType === "owner" ? !!ci.ownerName : !!ci.companyName;
                            const hasAddr = !!(ci.shippingAddress?.street);
                            const hasShipping = !!(o.selectedShipping);
                            const hasRef = !!(ci.ocReference);
                            if (!hasExtra && !hasAddr && !hasShipping && !hasRef) return null;
                            return (
                              <div style={{ marginBottom: "1rem" }}>
                                <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>Customer Details</div>
                                <table style={{ fontSize: "0.8rem", borderCollapse: "collapse" }}>
                                  <tbody>
                                    <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>Applicant Type</td><td style={{ paddingBottom:"4px", fontWeight:500 }}>{effectiveType === "agent" ? "Agent / Representative" : "Owner"}</td></tr>
                                    {effectiveType === "owner" && ci.ownerName && <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>Owner Name</td><td style={{ paddingBottom:"4px" }}>{ci.ownerName}</td></tr>}
                                    {effectiveType === "agent" && ci.companyName && <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>Company</td><td style={{ paddingBottom:"4px" }}>{ci.companyName}</td></tr>}
                                    {hasRef && <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>OC Reference</td><td style={{ paddingBottom:"4px" }}>{ci.ocReference}</td></tr>}
                                    {hasAddr && <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>Delivery Address</td><td style={{ paddingBottom:"4px" }}>{ci.shippingAddress.street}, {ci.shippingAddress.suburb} {ci.shippingAddress.state} {ci.shippingAddress.postcode}</td></tr>}
                                    {hasShipping && <tr><td style={{ color:"var(--muted)", paddingRight:"16px", paddingBottom:"4px" }}>Shipping</td><td style={{ paddingBottom:"4px" }}>{o.selectedShipping.name} — {fmt(o.selectedShipping.cost)}</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()}
                          {/* Documents section — order summary, authority doc, certificate, invoice */}
                          {(o.summaryUrl || o.lotAuthFileName || o.lotAuthorityFile || o.lotAuthorityUrl || o.certificateUrl || o.invoiceUrl) && (
                            <div style={{ marginBottom: "1rem" }}>
                              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>Documents</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {o.summaryUrl && (
                                  <a href={o.summaryUrl} target="_blank" rel="noreferrer" className="btn btn-out" style={{ fontSize: "0.78rem", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                                    <Ic n="doc" s={13}/> Order Summary
                                  </a>
                                )}
                                {(o.lotAuthFileName || o.lotAuthorityFile || o.lotAuthorityUrl) && (
                                  o.lotAuthorityUrl ? (
                                    <a href={o.lotAuthorityUrl} target="_blank" rel="noreferrer" className="btn btn-out" style={{ fontSize: "0.78rem", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                                      <Ic n="shield" s={13}/> Authority Doc
                                    </a>
                                  ) : (
                                    <a href={`/api/orders/${o.id}/authority?token=${adminToken}`} className="btn btn-out" style={{ fontSize: "0.78rem", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }} download>
                                      <Ic n="shield" s={13}/> Authority Doc
                                    </a>
                                  )
                                )}
                                {o.certificateUrl && (
                                  <a href={o.certificateUrl} target="_blank" rel="noreferrer" className="btn btn-out" style={{ fontSize: "0.78rem", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                                    <Ic n="doc" s={13}/> Certificate
                                  </a>
                                )}
                                {o.invoiceUrl && (
                                  <a href={o.invoiceUrl} target="_blank" rel="noreferrer" className="btn btn-out" style={{ fontSize: "0.78rem", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                                    <Ic n="invoice" s={13}/> Invoice
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Audit Log */}
                          {o.auditLog && o.auditLog.length > 0 && (
                            <div>
                              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>Audit Log</div>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                                <tbody>
                                  {o.auditLog.map((entry, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid var(--border2)" }}>
                                      <td style={{ padding: "3px 8px", color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(entry.ts).toLocaleString("en-AU")}</td>
                                      <td style={{ padding: "3px 8px", fontWeight: 600 }}>{entry.action}</td>
                                      <td style={{ padding: "3px 8px", color: "var(--muted)" }}>{entry.note || ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        );
      })()}

      {/* Send Certificate Modal */}
      {sendCertModal && (
        <SendCertificateModal
          order={sendCertModal.order}
          adminToken={adminToken}
          onClose={() => setSendCertModal(null)}
          onSent={(oid) => {
            setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status: "Issued", auditLog: [...(o.auditLog||[]), { ts: new Date().toISOString(), action: "Certificate issued", note: `Sent to: ${o.contactInfo?.email}` }] }) }));
            setSendCertModal(null);
          }}
        />
      )}

      {/* Send Invoice Modal */}
      {sendInvoiceModal && (
        <SendInvoiceModal
          order={sendInvoiceModal.order}
          adminToken={adminToken}
          onClose={() => setSendInvoiceModal(null)}
          onSent={(oid) => {
            setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status: "Invoice sent, awaiting payment", auditLog: [...(o.auditLog||[]), { ts: new Date().toISOString(), action: "Invoice sent", note: `Sent to: ${o.contactInfo?.email}` }] }) }));
            setSendInvoiceModal(null);
          }}
        />
      )}

      {/* Cancel Order Modal */}
      {cancelOrderModal && (
        <CancelOrderModal
          order={cancelOrderModal.order}
          adminToken={adminToken}
          onClose={() => setCancelOrderModal(null)}
          onCancelled={(oid, reason) => {
            setData(p => ({ ...p, orders: p.orders.map(o => o.id !== oid ? o : { ...o, status: "Cancelled", cancelReason: reason, auditLog: [...(o.auditLog||[]), { ts: new Date().toISOString(), action: "Order cancelled", note: reason }] }) }));
            setCancelOrderModal(null);
          }}
        />
      )}

      {/* ── SECURITY ── */}
      {adminTab === "settings" && (
        <SettingsTab adminToken={adminToken} pubConfig={pubConfig} />
      )}

      {adminTab === "branding" && (
        <BrandingTab adminToken={adminToken} pubConfig={pubConfig} setPubConfig={setPubConfig} />
      )}

      {adminTab === "storage" && (
        <StorageTab adminToken={adminToken} />
      )}

      {adminTab === "security" && (
        <SecurityTab adminToken={adminToken} currentUser={adminUser} onLogout={handleLogout} />
      )}

      {/* ── MODALS ── */}
      {modal === "plan" && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-tt">Add New Strata Plan</h2>
            {[["id","Plan ID (e.g. SP99999)"],["name","Plan Name"],["address","Address"]].map(([k,ph]) => (
              <div className="form-row" key={k}><label className="f-label">{ph}</label><input className="f-input" placeholder={ph} value={form[k]||""} onChange={e => upd(k,e.target.value)}/></div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-blk" style={{ flex: 1 }} onClick={addPlan}>Add Plan</button>
            </div>
          </div>
        </div>
      )}

      {modal === "editPlan" && (
        <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-tt">Edit Strata Plan</h2>
            <div className="form-row"><label className="f-label">Plan Name</label><input className="f-input" placeholder="Plan Name" value={form.name||""} onChange={e => upd("name",e.target.value)}/></div>
            <div className="form-row"><label className="f-label">Address</label><input className="f-input" placeholder="Address" value={form.address||""} onChange={e => upd("address",e.target.value)}/></div>
            <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button>
              <button className="btn btn-blk" style={{ flex: 1 }} onClick={savePlan}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {(modal === "product" || modal === "editProduct") && (
        <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-tt">{modal === "editProduct" ? "Edit Product" : "Add Product"}</h2>
            {[["name","Product Name"],["desc","Description"],["turnaround","Turnaround (e.g. 5 business days)"]].map(([k,ph]) => (
              <div className="form-row" key={k}><label className="f-label">{ph}</label><input className="f-input" placeholder={ph} value={form[k]||""} onChange={e => upd(k,e.target.value)}/></div>
            ))}
            <div className="form-row">
              <label className="f-label">Category</label>
              <select className="f-select" value={form.category||"oc"} onChange={e => upd("category",e.target.value)}>
                <option value="oc">OC Certificates</option>
                <option value="keys">Keys / Fobs / Remotes</option>
              </select>
            </div>
            <div className="form-row">
              <label className="f-label">Charged Per Owner Corporation?</label>
              <select className="f-select" value={form.perOC||"false"} onChange={e => upd("perOC",e.target.value)}>
                <option value="true">Yes — per OC in lot</option>
                <option value="false">No — fixed price per lot</option>
              </select>
            </div>
            <div className="form-row">
              <label className="f-label">1st OC Price (AUD, incl. GST)</label>
              <input className="f-input" type="number" min="0" step="0.01" placeholder="220.00" value={form.price||""} onChange={e => upd("price",e.target.value)}/>
            </div>
            {(form.perOC === "true" || form.perOC === true) && (
              <div className="form-row">
                <label className="f-label">Additional OC Price (AUD, incl. GST)</label>
                <input className="f-input" type="number" min="0" step="0.01" placeholder="150.00" value={form.secondaryPrice||""} onChange={e => upd("secondaryPrice",e.target.value)}/>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:"4px"}}>Leave blank to charge the same rate for all OCs.</div>
              </div>
            )}
            {/* Shipping cost overrides — shown when plan has shipping options */}
            {(() => {
              const activePlan = data.strataPlans.find(p => p.id === planId);
              const opts = activePlan?.shippingOptions || [];
              if (opts.length === 0) return null;
              return (
                <div className="form-row">
                  <label className="f-label">Shipping Cost Overrides <span style={{color:"var(--muted)",fontWeight:400,fontSize:"0.75rem"}}>(optional)</span></label>
                  <div style={{fontSize:"0.72rem",color:"var(--muted)",marginBottom:"6px"}}>Leave blank to use the plan's default shipping cost for each option.</div>
                  {opts.map(opt => (
                    <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ flex: 1, fontSize: "0.82rem" }}>{opt.name} <span style={{color:"var(--muted)"}}>(default {fmt(opt.cost)})</span></span>
                      <input className="f-input" type="number" min="0" step="0.01" style={{ width: "100px" }} placeholder={String(opt.cost)} value={form[`sc_${opt.id}`] ?? ""} onChange={e => upd(`sc_${opt.id}`, e.target.value)}/>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button>
              <button className="btn btn-blk" style={{ flex: 1 }} onClick={modal === "editProduct" ? saveProduct : addProduct}>
                {modal === "editProduct" ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "manageShipping" && editTarget && (() => {
        const targetPlan = data.strataPlans.find(p => p.id === editTarget.id);
        const opts = targetPlan?.shippingOptions || [];
        return (
          <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); setForm({}); }}>
            <div className="modal" style={{ maxWidth: "480px" }} onClick={e => e.stopPropagation()}>
              <h2 className="modal-tt">Shipping Options — {targetPlan?.name}</h2>
              {opts.length === 0 ? (
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1rem" }}>No shipping options configured. Add one below.</p>
              ) : (
                <table className="tbl" style={{ marginBottom: "1rem" }}>
                  <thead><tr><th>Name</th><th>Cost (AUD)</th><th>Needs Address</th><th></th></tr></thead>
                  <tbody>
                    {opts.map(opt => (
                      <tr key={opt.id}>
                        <td>{opt.name}</td>
                        <td>{fmt(opt.cost)}</td>
                        <td style={{ textAlign: "center" }}>{opt.requiresAddress !== false ? "✓" : "—"}</td>
                        <td><button className="tbl-act-btn danger" onClick={() => deleteShippingOption(opt.id)}><Ic n="trash" s={13}/> Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.6rem" }}>Add Option</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                  <div className="form-row" style={{ flex: 2, marginBottom: 0 }}>
                    <label className="f-label">Name</label>
                    <input className="f-input" placeholder="e.g. Standard Post" value={form.shippingName || ""} onChange={e => upd("shippingName", e.target.value)}/>
                  </div>
                  <div className="form-row" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="f-label">Cost ($)</label>
                    <input className="f-input" type="number" min="0" step="0.01" placeholder="10.00" value={form.shippingCost ?? ""} onChange={e => upd("shippingCost", e.target.value)}/>
                  </div>
                  <button className="btn btn-blk" style={{ padding: "8px 14px", fontSize: "0.78rem", whiteSpace: "nowrap" }} onClick={addShippingOption}><Ic n="plus" s={13}/> Add</button>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "0.8rem", color: "var(--forest)", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.shippingRequiresAddress !== false} onChange={e => upd("shippingRequiresAddress", e.target.checked)} style={{ accentColor: "var(--sage)" }}/>
                  Requires delivery address (uncheck for pickup / no shipment)
                </label>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <button className="btn btn-out" style={{ width: "100%" }} onClick={() => { setModal(null); setEditTarget(null); setForm({}); }}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}


      {(modal === "lot" || modal === "editLot") && (
        <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-tt">{modal === "editLot" ? "Edit Lot" : "Add Lot"}</h2>
            {[["lotNum","Lot Number (e.g. Lot 10)"],["level","Level (e.g. Level 3)"]].map(([k,ph]) => (
              <div className="form-row" key={k}><label className="f-label">{ph}</label><input className="f-input" placeholder={ph} value={form[k]||""} onChange={e => upd(k,e.target.value)}/></div>
            ))}
            <div className="form-row"><label className="f-label">Type</label>
              <select className="f-select" value={form.lotType||"Residential"} onChange={e => upd("lotType",e.target.value)}>
                {["Residential","Commercial","Parking","Storage","Mixed"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label className="f-label">Owner Corp IDs (comma-separated)</label>
              <input className="f-input" placeholder="OC-A, OC-B" value={form.ocIds||""} onChange={e => upd("ocIds",e.target.value)}/>
              {plan && <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:"4px"}}>Available: {Object.keys(plan.ownerCorps).join(", ")}</div>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button>
              <button className="btn btn-blk" style={{ flex: 1 }} onClick={modal === "editLot" ? saveLot : addLot}>
                {modal === "editLot" ? "Save Changes" : "Add Lot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(modal === "addOC" || modal === "editOC") && (
        <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-tt">{modal === "editOC" ? "Edit Owner Corporation" : "Add Owner Corporation"}</h2>
            {modal === "addOC" && (
              <div className="form-row">
                <label className="f-label">OC ID (e.g. OC-C)</label>
                <input className="f-input" placeholder="OC-C" value={form.ocId||""} onChange={e => upd("ocId",e.target.value)}/>
                <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:"4px"}}>Used to link lots to this OC. Cannot be changed after creation.</div>
              </div>
            )}
            {modal === "editOC" && (
              <div className="form-row">
                <label className="f-label">OC ID</label>
                <input className="f-input" value={editTarget?.id||""} disabled style={{ opacity: 0.6, cursor: "not-allowed" }}/>
              </div>
            )}
            <div className="form-row">
              <label className="f-label">Display Name</label>
              <input className="f-input" placeholder="Owner Corporation A — Residential" value={form.ocName||""} onChange={e => upd("ocName",e.target.value)}/>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => { setModal(null); setEditTarget(null); }}>Cancel</button>
              <button className="btn btn-blk" style={{ flex: 1 }} onClick={modal === "editOC" ? saveOC : addOC}>
                {modal === "editOC" ? "Save Changes" : "Add Owner Corp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN LOGIN ───────────────────────────────────────────────────────────────
function AdminLogin({ onAuth, pubConfig }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const attempt = async () => {
    if (loading || !user || !pass) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass }),
      });
      const data = await r.json();
      if (r.ok) {
        onAuth(data.token, data.user || user);
      } else {
        setErr(data.error || "Incorrect username or password.");
        setPass("");
      }
    } catch {
      setErr("Unable to connect to server. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap" style={{ margin: "-3rem -2rem", minHeight: "calc(100vh - 72px)" }}>
      <div className="login-card">
        <img src={pubConfig?.logo || `data:image/png;base64,${LOGO_B64}`} alt="TOCS" className="login-logo" style={{ height: 32, marginBottom: "2rem" }}/>
        <div className="login-title">Admin Access</div>
        <div className="login-sub">Sign in to manage plans, products and orders.</div>

        {err && <div className="login-err"><Ic n="x" s={14}/> {err}</div>}

        <div className="form-row">
          <label className="f-label">Username</label>
          <input className="f-input" type="email" placeholder="info@tocs.co" value={user} onChange={e => { setUser(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && attempt()} autoComplete="username"/>
        </div>
        <div className="form-row">
          <label className="f-label">Password</label>
          <div className="pw-wrap">
            <input className="f-input" type={showPw ? "text" : "password"} placeholder="••••••••" value={pass}
              onChange={e => { setPass(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && attempt()} autoComplete="current-password"
              style={{ paddingRight: "42px" }}/>
            <button className="pw-toggle" type="button" onClick={() => setShowPw(s => !s)}>
              <Ic n={showPw ? "eyeOff" : "eye"} s={16}/>
            </button>
          </div>
        </div>

        <button className="btn btn-blk btn-block" onClick={attempt} disabled={loading}>
          {loading
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Signing in…</>
            : <><Ic n="lock" s={15}/> Sign In</>
          }
        </button>
        <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <a href="mailto:info@tocs.co" style={{ fontSize: "0.75rem", color: "var(--muted)", textDecoration: "none" }}>Forgot password? Contact admin</a>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}



// ─── CANCEL ORDER MODAL ───────────────────────────────────────────────────────
function CancelOrderModal({ order, adminToken, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleCancel = async () => {
    if (!reason.trim()) { setErr("Please enter a reason for cancelling this order."); return; }
    if (!confirmed) { setErr("Please tick the confirmation checkbox before proceeding."); return; }
    setSaving(true); setErr("");
    try {
      await fetch(`/api/orders/${order.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ status: "Cancelled", note: reason }),
      });
      onCancelled(order.id, reason);
    } catch {
      setErr("Network error — please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "480px", width: "100%" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 className="modal-tt" style={{ marginBottom: 0, color: "var(--red)" }}>Cancel Order</h2>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }} onClick={onClose}><Ic n="x" s={20}/></button>
        </div>

        <div className="alert alert-warn" style={{ marginBottom: "1.2rem" }}>
          You are about to cancel order <strong>{order.id}</strong> for <strong>{order.contactInfo?.name}</strong>.
          This action cannot be undone.
        </div>

        <div className="form-row">
          <label className="f-label">Cancellation Reason *</label>
          <textarea
            className="f-input"
            rows={4}
            placeholder="e.g. Duplicate order submitted by applicant, incorrect lot selected…"
            style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            value={reason}
            onChange={e => { setReason(e.target.value); setErr(""); }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", fontSize: "0.84rem", marginBottom: "1.2rem" }}>
          <input
            type="checkbox"
            style={{ marginTop: "2px", accentColor: "var(--red)", flexShrink: 0 }}
            checked={confirmed}
            onChange={e => { setConfirmed(e.target.checked); setErr(""); }}
          />
          <span>I confirm this order should be cancelled and understand this cannot be reversed.</span>
        </label>

        {err && <div className="alert alert-err" style={{ marginBottom: "1rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-out" style={{ flex: 1 }} onClick={onClose}>Keep Order</button>
          <button
            className="btn btn-lg"
            style={{ flex: 1, justifyContent: "center", background: "var(--red)", color: "white", border: "none" }}
            onClick={handleCancel}
            disabled={saving}
          >
            {saving
              ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Cancelling…</>
              : <><Ic n="trash" s={15}/> Cancel Order</>
            }
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── SEND CERTIFICATE MODAL ───────────────────────────────────────────────────
function SendCertificateModal({ order, adminToken, onClose, onSent }) {
  const [message, setMessage] = useState("");
  const [certFile, setCertFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const contact = order.contactInfo || {};
  const lot = order.items?.[0];

  // Pre-fill default message
  useEffect(() => {
    fetch("/api/config/settings", { headers: { "Authorization": "Bearer " + adminToken } })
      .then(r => r.json())
      .then(d => {
        const tpl = d.emailTemplate || {};
        const raw = (tpl.certificateGreeting || "Dear {name},\n\nPlease find attached your OC Certificate.\n\nKind regards,\nTOCS Team")
          .replace(/{name}/g, contact.name || "Applicant")
          .replace(/{lotNumber}/g, lot?.lotNumber || "")
          .replace(/{address}/g, lot?.planName || "");
        setMessage(raw);
      })
      .catch(() => setMessage("Dear " + (contact.name || "Applicant") + ",\n\nPlease find attached your OC Certificate.\n\nKind regards,\nTOCS Team"));
  }, []);

  const handleSend = async () => {
    if (sending) return;
    setSending(true); setErr("");
    try {
      let body = { message };
      if (certFile) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(certFile);
        });
        body.attachment = { filename: certFile.name, contentType: certFile.type || "application/pdf", data: base64 };
      }
      const r = await fetch(`/api/orders/${order.id}/send-certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        onSent(order.id);
      } else {
        setErr(d.error || "Failed to send email.");
        setSending(false);
      }
    } catch (e) {
      setErr("Network error: " + e.message);
      setSending(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "540px", width: "100%" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 className="modal-tt" style={{ marginBottom: 0 }}>Send Certificate</h2>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }} onClick={onClose}><Ic n="x" s={20}/></button>
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "1rem" }}>
          To: <strong style={{ color: "var(--ink)" }}>{contact.name}</strong> &lt;{contact.email}&gt; · Order {order.id}
        </div>

        <div className="form-row">
          <label className="f-label">Email Message</label>
          <textarea className="f-input" rows={8} style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            value={message} onChange={e => setMessage(e.target.value)}/>
        </div>

        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Attach Certificate (PDF)</label>
          {certFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--sage-tint)", fontSize: "0.82rem" }}>
              <Ic n="doc" s={15}/>
              <span style={{ flex: 1 }}>{certFile.name} ({(certFile.size/1024).toFixed(1)} KB)</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)" }} onClick={() => setCertFile(null)}><Ic n="x" s={14}/></button>
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: "2px dashed var(--border)", borderRadius: "4px", cursor: "pointer", fontSize: "0.82rem", color: "var(--forest)" }}>
              <Ic n="upload" s={16}/> Click to attach PDF certificate (optional)
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setCertFile(e.target.files[0]); }}/>
            </label>
          )}
        </div>

        {err && <div className="alert alert-err" style={{ marginTop: "1rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
          <button className="btn btn-out" onClick={onClose}>Cancel</button>
          <button className="btn btn-sage btn-lg" style={{ flex: 1, justifyContent: "center" }} onClick={handleSend} disabled={sending}>
            {sending
              ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Sending…</>
              : <><Ic n="mail" s={15}/> Send Certificate</>
            }
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── SEND INVOICE MODAL ───────────────────────────────────────────────────────
function SendInvoiceModal({ order, adminToken, onClose, onSent }) {
  const [message, setMessage] = useState("");
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const contact = order.contactInfo || {};

  useEffect(() => {
    fetch("/api/config/settings", { headers: { "Authorization": "Bearer " + adminToken } })
      .then(r => r.json())
      .then(d => {
        const pd = d.paymentDetails || {};
        const defaultMsg = `Dear ${contact.name || "Applicant"},\n\nPlease find attached your invoice for Keys/Fobs/Remotes order #${order.id}.\n\nPayment details:\nAccount Name: ${pd.accountName || "Top Owners Corporation"}\nBSB: ${pd.bsb || "033-065"}\nAccount Number: ${pd.accountNumber || "522011"}\nPayID: ${pd.payid || "accounts@tocs.com.au"}\n\nPlease use your order number as the payment reference.\n\nKind regards,\nTOCS Team`;
        setMessage(defaultMsg);
      })
      .catch(() => setMessage(`Dear ${contact.name || "Applicant"},\n\nPlease find attached your invoice for order #${order.id}.\n\nKind regards,\nTOCS Team`));
  }, []);

  const handleSend = async () => {
    if (sending) return;
    setSending(true); setErr("");
    try {
      let body = { message };
      if (invoiceFile) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(invoiceFile);
        });
        body.attachment = { filename: invoiceFile.name, contentType: invoiceFile.type || "application/pdf", data: base64 };
      }
      const r = await fetch(`/api/orders/${order.id}/send-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        onSent(order.id);
      } else {
        setErr(d.error || "Failed to send invoice.");
        setSending(false);
      }
    } catch (e) {
      setErr("Network error: " + e.message);
      setSending(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "540px", width: "100%" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 className="modal-tt" style={{ marginBottom: 0 }}>Send Invoice</h2>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }} onClick={onClose}><Ic n="x" s={20}/></button>
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "1rem" }}>
          To: <strong style={{ color: "var(--ink)" }}>{contact.name}</strong> &lt;{contact.email}&gt; · Order {order.id}
        </div>

        <div className="form-row">
          <label className="f-label">Email Message</label>
          <textarea className="f-input" rows={10} style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            value={message} onChange={e => setMessage(e.target.value)}/>
        </div>

        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Attach Invoice (PDF) <span style={{ color: "var(--muted)", fontWeight: 400 }}>— optional</span></label>
          {invoiceFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--sage-tint)", fontSize: "0.82rem" }}>
              <Ic n="doc" s={15}/>
              <span style={{ flex: 1 }}>{invoiceFile.name} ({(invoiceFile.size/1024).toFixed(1)} KB)</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)" }} onClick={() => setInvoiceFile(null)}><Ic n="x" s={14}/></button>
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: "2px dashed var(--border)", borderRadius: "4px", cursor: "pointer", fontSize: "0.82rem", color: "var(--forest)" }}>
              <Ic n="upload" s={16}/> Click to attach invoice PDF
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) setInvoiceFile(e.target.files[0]); }}/>
            </label>
          )}
        </div>

        {err && <div className="alert alert-err" style={{ marginTop: "1rem" }}>{err}</div>}

        <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem" }}>
          <button className="btn btn-out" onClick={onClose}>Cancel</button>
          <button className="btn btn-lg" style={{ flex: 1, justifyContent: "center", background: "#0d6e62", color: "#fff", border: "none", borderRadius: "28px" }} onClick={handleSend} disabled={sending}>
            {sending
              ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Sending…</>
              : <><Ic n="invoice" s={15}/> Send Invoice</>
            }
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab({ adminToken, pubConfig }) {
  const DEF_SMTP = { host: "mail-au.smtp2go.com", port: 2525, user: "OCCAPP", pass: "" };
  const DEF_PAY = { accountName: "Top Owners Corporation", bsb: "033-065", accountNumber: "522011", payid: "accounts@tocs.com.au" };
  const DEF_TPL = { certificateSubject: "Your OC Certificate — Order #{orderId}", certificateGreeting: "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team", footer: "Top Owners Corporation Solution  |  info@tocs.co" };

  const [orderEmail, setOrderEmail] = useState("Orders@tocs.co");
  const [smtp, setSmtp] = useState(DEF_SMTP);
  const [payDetails, setPayDetails] = useState(DEF_PAY);
  const [emailTpl, setEmailTpl] = useState(DEF_TPL);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePubKey, setStripePubKey] = useState("");
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState(null);

  useEffect(() => {
    fetch("/api/config/settings", { headers: { "Authorization": "Bearer " + adminToken } })
      .then(r => r.json())
      .then(d => {
        setOrderEmail(d.orderEmail || "Orders@tocs.co");
        setSmtp({ ...DEF_SMTP, ...(d.smtp || {}) });
        setPayDetails({ ...DEF_PAY, ...(d.paymentDetails || {}) });
        setEmailTpl({ ...DEF_TPL, ...(d.emailTemplate || {}) });
        setStripeSecretKey(d.stripe?.secretKey || "");
        setStripePubKey(d.stripe?.publishableKey || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updSmtp = (k, v) => { setSmtp(p => ({ ...p, [k]: v })); setSaved(false); setSaveErr(""); };
  const updPay  = (k, v) => { setPayDetails(p => ({ ...p, [k]: v })); setSaved(false); setSaveErr(""); };
  const updTpl  = (k, v) => { setEmailTpl(p => ({ ...p, [k]: v })); setSaved(false); setSaveErr(""); };

  const save = async () => {
    setSaveErr(""); setTestResult(null);
    try {
      const r = await fetch("/api/config/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({
          orderEmail, smtp, paymentDetails: payDetails, emailTemplate: emailTpl,
          stripe: { secretKey: stripeSecretKey, publishableKey: stripePubKey },
        }),
      });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 3500); }
      else { const d = await r.json(); setSaveErr(d.error || "Save failed."); }
    } catch { setSaveErr("Unable to connect to server."); }
  };

  const testEmail = async () => {
    setTesting(true); setTestResult(null); setSaveErr("");
    try {
      // Send current form values so the test works even before saving
      const r = await fetch("/api/config/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ smtp, orderEmail }),
      });
      const d = await r.json();
      if (r.ok) setTestResult({ ok: true, msg: `Test email sent to ${d.sentTo}. Check your inbox.` });
      else setTestResult({ ok: false, msg: d.error || "Test failed." });
    } catch { setTestResult({ ok: false, msg: "Unable to connect to server." }); }
    setTesting(false);
  };

  const testStripe = async () => {
    setTestingStripe(true); setStripeTestResult(null); setSaveErr("");
    try {
      const r = await fetch("/api/config/settings?action=test-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ stripe: { secretKey: stripeSecretKey } }),
      });
      const d = await r.json();
      if (d.ok) {
        setStripeTestResult({ ok: true, msg: `✅ Connected · ${d.mode === "test" ? "Test Mode" : "⚠️ Live Mode"} · ${d.accountId} (key from ${d.keySource})` });
      } else {
        setStripeTestResult({ ok: false, msg: d.error || "Connection failed." });
      }
    } catch { setStripeTestResult({ ok: false, msg: "Unable to connect to server." }); }
    setTestingStripe(false);
  };

  if (loading) return <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>Loading settings…</div>;

  const rowSt = { display: "flex", gap: "10px" };

  const stripeModeFromKey = (k) => {
    if (!k || k === "••••••••") return null;
    if (k.startsWith("sk_live_")) return { label: "Live Mode", color: "#b45309" };
    if (k.startsWith("sk_test_")) return { label: "Test Mode", color: "#16a34a" };
    return null;
  };
  const stripeMode = stripeModeFromKey(stripeSecretKey);

  return (
    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Order notification email */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Order Notifications</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          New order notifications will be sent to this address.
        </p>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Recipient Email</label>
          <input className="f-input" type="email" placeholder="Orders@tocs.co" value={orderEmail}
            onChange={e => { setOrderEmail(e.target.value); setSaved(false); setSaveErr(""); }}/>
        </div>
      </div>

      {/* Payment Details */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Payment Details</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Bank and PayID details shown to applicants during checkout and on order receipts.
        </p>
        <div className="form-row">
          <label className="f-label">Account Name</label>
          <input className="f-input" type="text" placeholder="Top Owners Corporation" value={payDetails.accountName}
            onChange={e => updPay("accountName", e.target.value)}/>
        </div>
        <div style={rowSt}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="f-label">BSB</label>
            <input className="f-input" type="text" placeholder="033-065" value={payDetails.bsb}
              onChange={e => updPay("bsb", e.target.value)}/>
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="f-label">Account Number</label>
            <input className="f-input" type="text" placeholder="522011" value={payDetails.accountNumber}
              onChange={e => updPay("accountNumber", e.target.value)}/>
          </div>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">PayID (email)</label>
          <input className="f-input" type="email" placeholder="accounts@tocs.com.au" value={payDetails.payid}
            onChange={e => updPay("payid", e.target.value)}/>
        </div>
      </div>

      {/* Stripe Payments */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Stripe Payments</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Enable card payments via Stripe. Keys are stored securely and take priority over Vercel environment variables.
        </p>

        {stripeMode && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: stripeMode.color + "18", border: `1px solid ${stripeMode.color}40`, borderRadius: "20px", padding: "3px 12px", marginBottom: "16px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stripeMode.color, display: "inline-block" }}/>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: stripeMode.color, letterSpacing: "0.06em" }}>{stripeMode.label}</span>
          </div>
        )}
        {!stripeMode && stripeSecretKey === "" && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "20px", padding: "3px 12px", marginBottom: "16px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9ca3af", display: "inline-block" }}/>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em" }}>Not Configured</span>
          </div>
        )}

        <div className="form-row">
          <label className="f-label">Secret Key</label>
          <div className="pw-wrap">
            <input className="f-input" type={showStripeKey ? "text" : "password"}
              placeholder="sk_test_••••  or  sk_live_••••"
              value={stripeSecretKey}
              onChange={e => { setStripeSecretKey(e.target.value); setSaved(false); setSaveErr(""); setStripeTestResult(null); }}
              style={{ paddingRight: "42px" }}/>
            <button className="pw-toggle" type="button" onClick={() => setShowStripeKey(p => !p)}>
              <Ic n={showStripeKey ? "eyeOff" : "eye"} s={16}/>
            </button>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Find this in your Stripe Dashboard → Developers → API keys.
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: "1rem" }}>
          <label className="f-label">Publishable Key</label>
          <input className="f-input" type="text"
            placeholder="pk_test_••••  or  pk_live_••••"
            value={stripePubKey}
            onChange={e => { setStripePubKey(e.target.value); setSaved(false); setSaveErr(""); }}/>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Optional — used to display card brands and for future client-side integrations.
          </div>
        </div>

        {stripeTestResult?.ok === true  && <div className="alert alert-ok"  style={{ marginBottom: "10px" }}>{stripeTestResult.msg}</div>}
        {stripeTestResult?.ok === false && <div className="alert alert-err" style={{ marginBottom: "10px" }}>{stripeTestResult.msg}</div>}

        <button className="btn btn-out" onClick={testStripe} disabled={testingStripe || (stripeSecretKey === "••••••••") || (!stripeSecretKey && !pubConfig?.stripeEnabled)}>
          {testingStripe
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(0,0,0,0.15)",borderTop:"2px solid #1c3326",borderRadius:"50%",width:13,height:13}}/> Testing…</>
            : <><Ic n="check" s={15}/> Test Stripe Connection</>
          }
        </button>
      </div>

      {/* SMTP configuration */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>SMTP Server</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Outgoing mail server (SMTP) settings for sending order notifications and certificate emails.
        </p>
        <div style={rowSt}>
          <div className="form-row" style={{ flex: 3 }}>
            <label className="f-label">Host</label>
            <input className="f-input" type="text" placeholder="mail-au.smtp2go.com" value={smtp.host}
              onChange={e => updSmtp("host", e.target.value)}/>
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="f-label">Port</label>
            <input className="f-input" type="number" placeholder="2525" value={smtp.port}
              onChange={e => updSmtp("port", e.target.value)}/>
          </div>
        </div>
        <div className="form-row">
          <label className="f-label">Username (email)</label>
          <input className="f-input" type="email" placeholder="OCCAPP" value={smtp.user}
            onChange={e => updSmtp("user", e.target.value)}/>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Password</label>
          <div className="pw-wrap">
            <input className="f-input" type={showPass ? "text" : "password"} placeholder="App password or account password"
              value={smtp.pass} onChange={e => updSmtp("pass", e.target.value)} style={{ paddingRight: "42px" }}/>
            <button className="pw-toggle" type="button" onClick={() => setShowPass(p => !p)}>
              <Ic n={showPass ? "eyeOff" : "eye"} s={16}/>
            </button>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Use an App Password if Multi-Factor Authentication is enabled on the account.
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Email Templates</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Customise the certificate email sent to applicants. Placeholders: <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{name}"}</code> <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{lotNumber}"}</code> <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{address}"}</code> <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{orderId}"}</code>
        </p>
        <div className="form-row">
          <label className="f-label">Certificate Email Subject</label>
          <input className="f-input" type="text" value={emailTpl.certificateSubject}
            onChange={e => updTpl("certificateSubject", e.target.value)}/>
        </div>
        <div className="form-row">
          <label className="f-label">Email Body / Greeting</label>
          <textarea className="f-input" rows={7} style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            value={emailTpl.certificateGreeting} onChange={e => updTpl("certificateGreeting", e.target.value)}/>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Email Footer</label>
          <input className="f-input" type="text" value={emailTpl.footer}
            onChange={e => updTpl("footer", e.target.value)}/>
        </div>
      </div>

      {/* Feedback */}
      {saved                      && <div className="alert alert-ok">Settings saved successfully.</div>}
      {saveErr                    && <div className="alert alert-err">{saveErr}</div>}
      {testResult?.ok  === true   && <div className="alert alert-ok">{testResult.msg}</div>}
      {testResult?.ok  === false  && <div className="alert alert-err">{testResult.msg}</div>}

      <div style={{ display: "flex", gap: "10px" }}>
        <button className="btn btn-blk" style={{ flex: 1 }} onClick={save}>
          <Ic n="check" s={15}/> Save Settings
        </button>
        <button className="btn btn-out" style={{ flex: 1 }} onClick={testEmail} disabled={testing}>
          {testing
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(0,0,0,0.15)",borderTop:"2px solid #1c3326",borderRadius:"50%",width:13,height:13}}/> Sending…</>
            : <><Ic n="mail" s={15}/> Test Email</>
          }
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── BRANDING TAB ─────────────────────────────────────────────────────────────
function BrandingTab({ adminToken, pubConfig, setPubConfig }) {
  const [preview, setPreview] = useState(pubConfig?.logo || null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { setErr("Image must be under 500 KB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setPreview(ev.target.result); setSaved(false); setErr(""); };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => { setPreview(null); setSaved(false); setErr(""); };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/config/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ logo: preview || "" }),
      });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
        // Update pubConfig so header logo refreshes immediately
        if (setPubConfig) setPubConfig(p => ({ ...p, logo: preview || "" }));
      } else {
        const d = await r.json();
        setErr(d.error || "Save failed.");
      }
    } catch { setErr("Unable to connect to server."); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: "480px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Portal Logo</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Upload a logo to display in the portal header and admin login page. PNG or SVG recommended. Max 500 KB.
        </p>

        {/* Preview */}
        <div style={{ background: "var(--sage-tint)", border: "1px solid var(--border)", borderRadius: "6px", padding: "24px", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "1rem", minHeight: "80px" }}>
          {preview
            ? <img src={preview} alt="Logo preview" style={{ maxHeight: "60px", maxWidth: "100%", objectFit: "contain" }}/>
            : <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>No logo set — using default</span>
          }
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <label className="btn btn-out" style={{ flex: 1, cursor: "pointer", justifyContent: "center" }}>
            <Ic n="upload" s={15}/> {preview ? "Change Logo" : "Upload Logo"}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp" style={{ display: "none" }} onChange={handleFile}/>
          </label>
          {preview && (
            <button className="btn btn-out" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={removeLogo}>
              <Ic n="x" s={15}/> Remove
            </button>
          )}
        </div>
      </div>

      {err  && <div className="alert alert-err">{err}</div>}
      {saved && <div className="alert alert-ok">Logo saved successfully.</div>}

      <button className="btn btn-blk" onClick={save} disabled={saving}>
        {saving
          ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Saving…</>
          : <><Ic n="check" s={15}/> Save Logo</>
        }
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── STORAGE TAB ──────────────────────────────────────────────────────────────
function StorageTab({ adminToken }) {
  const DEF_SP = { tenantId: "", clientId: "", clientSecret: "", siteId: "", folderPath: "Top Owners Corporation Solution/ORDER DATABASE" };
  const [sp, setSp] = useState(DEF_SP);
  const [showSecret, setShowSecret] = useState(false);
  const [secretPlaceholder, setSecretPlaceholder] = useState(false); // true when server returned "••••••••"
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [spTesting, setSpTesting] = useState(false);
  const [spTestResult, setSpTestResult] = useState(null);

  useEffect(() => {
    fetch("/api/config/settings", { headers: { "Authorization": "Bearer " + adminToken } })
      .then(r => r.json())
      .then(d => {
        const s = d.sharepoint || DEF_SP;
        const masked = s.clientSecret === "••••••••";
        setSecretPlaceholder(masked);
        setSp({ ...DEF_SP, ...s, clientSecret: masked ? "" : (s.clientSecret || "") });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updSp = (k, v) => { setSp(p => ({ ...p, [k]: v })); setSaved(false); setErr(""); if (k === "clientSecret") setSecretPlaceholder(false); };

  const testSharePoint = async () => {
    setSpTesting(true); setSpTestResult(null);
    try {
      const r = await fetch("/api/config/test-sharepoint", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
      });
      const d = await r.json();
      setSpTestResult(d);
    } catch { setSpTestResult({ error: "Unable to connect to server." }); }
    setSpTesting(false);
  };

  const save = async () => {
    setErr("");
    try {
      const payload = { ...sp };
      // If secret is blank and placeholder was shown, don't overwrite it
      if (!payload.clientSecret && secretPlaceholder) delete payload.clientSecret;
      const r = await fetch("/api/config/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ sharepoint: payload }),
      });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 3500); }
      else { const d = await r.json(); setErr(d.error || "Save failed."); }
    } catch { setErr("Unable to connect to server."); }
  };

  if (loading) return <div className="panel" style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>SharePoint / OneDrive Storage</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
          Authority documents uploaded with orders will be stored in Microsoft SharePoint via the Graph API. Leave blank to store in Redis only.
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Requires an Azure App Registration with <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>Files.ReadWrite.All</code> and <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>Sites.ReadWrite.All</code> application permissions (grant admin consent).
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="f-label">Tenant ID</label>
            <input className="f-input" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={sp.tenantId} onChange={e => updSp("tenantId", e.target.value)}/>
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label className="f-label">Client ID</label>
            <input className="f-input" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={sp.clientId} onChange={e => updSp("clientId", e.target.value)}/>
          </div>
        </div>
        <div className="form-row">
          <label className="f-label">Client Secret</label>
          <div className="pw-wrap">
            <input className="f-input" type={showSecret ? "text" : "password"}
              placeholder={secretPlaceholder ? "Saved — enter new value to change" : "App registration client secret"}
              value={sp.clientSecret} onChange={e => updSp("clientSecret", e.target.value)} style={{ paddingRight: "42px" }}/>
            <button className="pw-toggle" type="button" onClick={() => setShowSecret(p => !p)}>
              <Ic n={showSecret ? "eyeOff" : "eye"} s={16}/>
            </button>
          </div>
        </div>
        <div className="form-row">
          <label className="f-label">SharePoint Site ID</label>
          <input className="f-input" type="text" placeholder="your-domain.sharepoint.com,xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={sp.siteId} onChange={e => updSp("siteId", e.target.value)}/>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>Find via Graph API: <code style={{background:"var(--cream)",padding:"1px 3px",borderRadius:"3px"}}>{"GET /v1.0/sites/{hostname}:/sites/{sitename}"}</code></div>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label className="f-label">Folder Path</label>
          <input className="f-input" type="text" placeholder="Top Owners Corporation Solution/ORDER DATABASE" value={sp.folderPath} onChange={e => updSp("folderPath", e.target.value)}/>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>Primary folder path in the default document library. A read-only shadow copy is automatically saved to a sibling <code style={{background:"var(--cream)",padding:"1px 3px",borderRadius:"3px"}}>TOCS ORDERS</code> folder.</div>
        </div>
      </div>

      {err  && <div className="alert alert-err">{err}</div>}
      {saved && <div className="alert alert-ok">SharePoint settings saved.</div>}

      <div style={{ display: "flex", gap: "10px" }}>
        <button className="btn btn-blk" style={{ flex: 1 }} onClick={save}>
          <Ic n="check" s={15}/> Save Storage Settings
        </button>
        <button className="btn btn-out" style={{ flex: 1 }} onClick={testSharePoint} disabled={spTesting}>
          {spTesting
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(0,0,0,0.15)",borderTop:"2px solid #1c3326",borderRadius:"50%",width:13,height:13}}/> Testing…</>
            : <><Ic n="cloud" s={15}/> Test SharePoint</>}
        </button>
      </div>

      {spTestResult && (
        <div className="panel" style={{ fontSize: "0.82rem" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>SharePoint Diagnostic</div>
          {spTestResult.error && <div style={{ color: "var(--red)" }}>❌ {spTestResult.error}</div>}
          {spTestResult.steps && spTestResult.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "4px 0", borderBottom: "1px solid var(--border2)" }}>
              <span style={{ flexShrink: 0 }}>{s.ok ? "✅" : "❌"}</span>
              <div>
                <span style={{ fontWeight: 500, textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.05em", color: "var(--muted)" }}>{s.step}</span>
                <div style={{ color: s.ok ? "var(--forest)" : "var(--red)" }}>{s.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SECURITY TAB ──────────────────────────────────────────────────────────────
function SecurityTab({ adminToken, currentUser, onLogout }) {
  const [form, setForm] = useState({ newUser: currentUser || "", current: "", newPw: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = (k) => setShowPw(p => ({ ...p, [k]: !p[k] }));
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (loading) return;
    if (!form.current) { setMsg({ type: "err", text: "Current password is required." }); return; }
    if (form.newPw && form.newPw.length < 8) { setMsg({ type: "err", text: "New password must be at least 8 characters." }); return; }
    if (form.newPw && form.newPw !== form.confirm) { setMsg({ type: "err", text: "New passwords do not match." }); return; }
    setLoading(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/change-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ currentPass: form.current, newUser: form.newUser || undefined, newPass: form.newPw || undefined }),
      });
      const data = await r.json();
      if (r.ok) {
        setMsg({ type: "ok", text: "Credentials updated. Please sign in again." });
        setTimeout(() => onLogout(), 2500);
      } else {
        setMsg({ type: "err", text: data.error || "Update failed." });
      }
    } catch {
      setMsg({ type: "err", text: "Unable to connect to server." });
    }
    setLoading(false);
  };

  const PwField = ({ label, k, fk }) => (
    <div className="form-row">
      <label className="f-label">{label}</label>
      <div className="pw-wrap">
        <input className="f-input" type={showPw[k] ? "text" : "password"} value={form[fk]} onChange={e => { upd(fk, e.target.value); setMsg(null); }} style={{ paddingRight: "42px" }}/>
        <button className="pw-toggle" type="button" onClick={() => toggle(k)}><Ic n={showPw[k] ? "eyeOff" : "eye"} s={16}/></button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: "460px" }}>
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Update Admin Credentials</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Change your admin username or password. You will be signed out after saving.
        </p>

        {msg && <div className={`alert ${msg.type === "ok" ? "alert-ok" : "alert-warn"}`}>{msg.text}</div>}

        <div className="form-row">
          <label className="f-label">Username (email)</label>
          <input className="f-input" type="email" value={form.newUser} onChange={e => { upd("newUser", e.target.value); setMsg(null); }}/>
        </div>
        <PwField label="Current Password *" k="current" fk="current"/>
        <PwField label="New Password (leave blank to keep current)" k="new" fk="newPw"/>
        <PwField label="Confirm New Password" k="confirm" fk="confirm"/>

        <button className="btn btn-blk btn-block" onClick={submit} disabled={loading}>
          {loading
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",borderRadius:"50%",width:14,height:14}}/> Saving…</>
            : <><Ic n="shield" s={15}/> Save Credentials</>
          }
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

