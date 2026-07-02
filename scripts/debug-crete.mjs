import { resolveImage } from "../api/images/_resolveImage.js";

const result = await resolveImage({
  kind: "hero",
  label: "Crete",
  context: "Greece",
  uiLang: "fr",
});

if (result.image == null) {
  console.log("null", result.reason || "");
} else {
  console.log(JSON.stringify(result.image, null, 2));
}
