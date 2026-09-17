export type FirefoxGroupInput = { name: string; urls: string[] };

/** A pasted heading is optional; invalid lines are never silently discarded. */
export function parseFirefoxGroup(text: string, explicitName = ""): FirefoxGroupInput {
  const lines = text.split(/\r?\n/).map((value, index) => ({ value: value.trim(), number: index + 1 }))
    .filter((line) => line.value);
  let heading = "";
  if (lines.length > 1 && !/^[a-z][a-z\d+.-]*:/i.test(lines[0].value)
    && !/^(?:www\.|\/|\\)/i.test(lines[0].value)) {
    heading = lines.shift()!.value;
  }
  const name = explicitName.trim() || heading;
  if (!name) throw new Error("Escribe un nombre o inclúyelo en la primera línea.");
  if ([...name].length > 80) throw new Error("El nombre puede tener hasta 80 caracteres.");
  if (!lines.length) throw new Error("Agrega al menos una URL.");
  const urls = lines.map(({ value, number }) => {
    try {
      if (/\s|[\u0000-\u001f\u007f]/.test(value) || !/^(?:https?:\/\/|file:\/\/\/)/i.test(value)) throw new Error();
      const url = new URL(value);
      if (url.protocol === "file:") {
        if (url.hostname || !/^\/[a-z]:\/.+/i.test(url.pathname)) throw new Error();
      } else if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error();
      return url.href;
    } catch {
      throw new Error(`Línea ${number}: usa una URL http(s) o file:///C:/… válida; codifica los espacios como %20.`);
    }
  });
  return { name, urls };
}
