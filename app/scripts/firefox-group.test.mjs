import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFirefoxGroup } from "../src/firefoxGroup.ts";

test("pasted title and mixed URLs retain order, encoding, queries and fragments", () => {
  const urls = [
    "https://example.com/community?page_num=0&loc=",
    "https://example.com/file-storage/#/246411095",
    "https://example.com/view/public%2Fnuestro-patrimonio%2FCarta.pdf",
    "https://example.com/doc.aspx?sourcedoc=%7Bbf9c78e5%7D&web=1",
    "file:///C:/Users/Public/Documents/lectura.pdf",
  ];
  assert.deepEqual(parseFirefoxGroup("prueba\r\n" + urls.join("\r\n")), { name: "prueba", urls });
});

test("accepts separately entered name and one or many URLs", () => {
  assert.deepEqual(parseFirefoxGroup("\n https://example.com/ \n", " Investigación "), {
    name: "Investigación", urls: ["https://example.com/"],
  });
});

test("reports the original line number and never saves only the valid subset", () => {
  assert.throws(() => parseFirefoxGroup("prueba\nhttps://example.com\n\njavascript:alert(1)"), /Línea 4/);
  assert.throws(() => parseFirefoxGroup("prueba\nhttps://example.com\ninvalid"), /Línea 3/);
});

test("rejects missing names, empty groups, malformed URLs and remote files", () => {
  assert.throws(() => parseFirefoxGroup("https://example.com"), /nombre/);
  assert.throws(() => parseFirefoxGroup("", "prueba"), /al menos/);
  for (const url of ["--profile", "https://", "file://server/share/doc.pdf", "file:///relative.pdf", "data:text/html,x", "https://example.com/a b"]) {
    assert.throws(() => parseFirefoxGroup(url, "prueba"));
  }
});
