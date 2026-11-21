/**
 * Typographie des contenus générés et affichés : AUCUN tiret long (U+2014), demi-cadratin (U+2013),
 * barre horizontale (U+2015) ni tiret de chiffres (U+2012). Uniquement le trait d'union simple « - ».
 *
 * Deux filets complémentaires : les consignes données au modèle (qui reformule la phrase quand c'est
 * possible) et cette fonction (qui garantit le résultat). Idempotente. Ne touche pas aux sauts de ligne.
 */
export function normalizeDashes(input: string): string {
  return (
    input
      // Tiret long / barre horizontale : en début de ligne c'est une puce ; en fin de ligne on n'ajoute pas d'espace
      // final ; ailleurs c'est une incise.
      .replace(/^([ \t]*)[—―][ \t]*/gm, "$1- ")
      .replace(/[ \t]*[—―][ \t]*(?=\n|$)/g, " -")
      .replace(/[ \t]*[—―][ \t]*/g, " - ")
      // Demi-cadratin / tiret de chiffres : plage collée (2020–2023) -> 2020-2023 ; avec espaces -> " - ".
      .replace(/^([ \t]*)[–‒][ \t]*/gm, "$1- ")
      .replace(/[ \t]*[–‒][ \t]*(?=\n|$)/g, " -")
      .replace(/([ \t]*)[–‒]([ \t]*)/g, (_m, a: string, b: string) => (a || b ? " - " : "-"))
  );
}
