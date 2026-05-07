import "./app.css";
import "./brand/theme.css";
import { brand } from "./brand/brand.config";
import "./components/zoea-app";

document.title = brand.productName;

if (brand.faviconUrl) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = brand.faviconUrl;
}

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found");
}

app.replaceChildren(document.createElement("zoea-app"));
