#!/usr/bin/env node
import { randomBytes, randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";

import { hashPassphrase, MIN_PASSPHRASE_LENGTH } from "@portfolio-lab/security";

/**
 * Genere les trois valeurs d'acces de PortfolioLab.
 *
 * Ce script tourne **sur votre machine**. La phrase secrete que vous saisissez
 * n'est ni enregistree, ni transmise, ni affichee : seule son empreinte sort
 * d'ici, et une empreinte ne se retourne pas en phrase.
 *
 * Les trois valeurs produites vont dans les variables d'environnement de
 * l'hebergeur — jamais dans Git.
 */

const CTRL_C = "\u0003";
const BACKSPACE = "\u007f";

const line = (text = "") => stdout.write(`${text}\n`);

/**
 * Saisie masquee.
 *
 * En terminal, l'echo est coupe : sans cela la phrase resterait lisible a
 * l'ecran, et surtout dans l'historique de defilement.
 *
 * Hors terminal — un test, un tube — l'entree est lue **en une fois** puis
 * distribuee ligne par ligne. Consommer le flux deux fois avec un iterateur
 * asynchrone le fermerait apres la premiere question, et la confirmation
 * echouerait sans rapport avec ce que l'utilisateur a tape.
 */
let piped: string[] | null = null;

async function readAllStdin(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/u);
}

async function askHidden(question: string): Promise<string> {
  if (stdin.isTTY !== true) {
    piped ??= await readAllStdin();
    return piped.shift() ?? "";
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  const value = await new Promise<string>((resolve) => {
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      if (text === "\r" || text === "\n") {
        stdin.off("data", onData);
        resolve(buffer);
        return;
      }
      if (text === CTRL_C) {
        stdin.setRawMode(false);
        line();
        process.exit(130);
      }
      if (text === BACKSPACE) {
        buffer = buffer.slice(0, -1);
        return;
      }
      buffer += text;
    };
    stdin.on("data", onData);
  });

  stdin.setRawMode(false);
  stdin.pause();
  line();
  return value;
}

async function main(): Promise<void> {
  line("PortfolioLab — creation de votre acces");
  line("──────────────────────────────────────");
  line();
  line("Choisissez une phrase secrete longue et facile a retenir.");
  line(`Minimum ${MIN_PASSPHRASE_LENGTH} caracteres — une phrase de quatre mots vaut mieux`);
  line("qu'un mot complique : elle est plus longue et plus facile a retenir.");
  line();
  line("Elle ne sera pas affichee pendant la saisie.");
  line();

  const passphrase = await askHidden("Phrase secrete : ");
  const again = await askHidden("Confirmez      : ");

  if (passphrase !== again) {
    line();
    line("Les deux saisies different. Rien n'a ete genere.");
    process.exit(1);
  }

  let hash;
  try {
    hash = hashPassphrase(passphrase);
  } catch (error) {
    line();
    line(error instanceof Error ? error.message : "Phrase refusee.");
    process.exit(1);
  }

  line();
  line("Copiez ces trois lignes dans les variables d'environnement de votre hebergeur.");
  line("Ne les mettez jamais dans Git.");
  line();
  line(`PORTFOLIO_LAB_OWNER_ID=${randomUUID()}`);
  line(`PORTFOLIO_LAB_SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
  line(`PORTFOLIO_LAB_PASSPHRASE_HASH=${hash}`);
  line();
  line("L'identifiant ci-dessus est celui du proprietaire du portefeuille : il doit");
  line("correspondre a la ligne creee en base. Voir docs/DEPLOIEMENT.md.");

}

void main();
