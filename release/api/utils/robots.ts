export const names = [
  // Film & TV
  "r2-d2",
  "c-3po",
  "hal-9000",
  "t-800",
  "robby-the-robot",
  "gort",
  "wall-e",
  "eve",
  "data",
  "marvin",
  "bender",
  "rosie",
  "johnny-5",
  "baymax",
  "ed-209",
  "ash",
  "bishop",
  "kryten",
  "k-9",
  "bb-8",
  "kitt",
  "cylons",
  "dolores",
  "ava",

  // Literature
  "r-daneel-olivaw",
  "robbie",
  "andrew-martin",

  // Comics & Animation
  "ultron",
  "vision",
  "astro-boy",
  "doraemon",
  "voltron",
  "optimus-prime",
  "megazord",

  // Video Games
  "glados",
  "wheatley",
  "mega-man",
  "metal-sonic",
  "hk-47",
  "2b",
  "claptrap",
];

export const randomName = (): string =>
  names[Math.floor(Math.random() * names.length)];
