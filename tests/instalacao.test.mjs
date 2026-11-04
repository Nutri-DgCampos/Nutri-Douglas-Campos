import { test } from "node:test";
import assert from "node:assert/strict";
import { ehSamsungInternet, linkParaChrome } from "../lib/instalacao.ts";

// Samsung Internet: o app gerado é bloqueado pelo Play Protect no Android 14+;
// o aviso orienta a instalar pelo Chrome (04/11/2026).
test("reconhece o Samsung Internet e não confunde com o Chrome", () => {
  const samsung = "Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";
  const chrome = "Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  assert.equal(ehSamsungInternet(samsung), true);
  assert.equal(ehSamsungInternet(chrome), false);
});

test("link abre a mesma página no Chrome, com a loja como alternativa", () => {
  const link = linkParaChrome("https://nutridgcampos.com/area-paciente?x=1");
  assert.equal(
    link,
    "intent://nutridgcampos.com/area-paciente?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.android.chrome;end"
  );
});
