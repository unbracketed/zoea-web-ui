import "./app.css";
import "./components/zoea-app";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found");
}

app.replaceChildren(document.createElement("zoea-app"));
