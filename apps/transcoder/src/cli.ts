import * as path from "path";
import { transcodeToHls } from "./transcoder";

async function main() {
  const args = process.argv.slice(2);
  const inputArg = args[0];
  const outputArg = args[1] || "./media_output";

  if (!inputArg) {
    console.log("Uso: npm run transcode -- <caminho-do-video-mp4> [diretorio-de-saida]");
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  const outputDir = path.resolve(outputArg);

  console.log(`[CLI] Iniciando transcodificação HLS:`);
  console.log(`  Arquivo de entrada: ${inputPath}`);
  console.log(`  Diretório de saída: ${outputDir}`);

  const startTime = Date.now();
  try {
    const result = await transcodeToHls({
      inputPath,
      outputDir,
    });
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[CLI] Transcodificação concluída com sucesso em ${elapsedSeconds}s!`);
    console.log(`[CLI] Master Playlist: ${result.masterPlaylistPath}`);
  } catch (err) {
    console.error("[CLI] Falha fatal na transcodificação:", err);
    process.exit(1);
  }
}

main();
