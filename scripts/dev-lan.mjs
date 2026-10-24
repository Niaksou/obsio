// Lance `pnpm dev` joignable depuis un téléphone du même réseau Wi-Fi : l'adresse IP locale du
// poste remplace `localhost` pour le front, l'API et le stockage (liens signés compris).
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

const ip = process.env.LAN_IP ?? lanAddress();
if (!ip) {
  console.error('Adresse IP locale introuvable : précisez-la avec LAN_IP=192.168.x.y pnpm dev:lan');
  process.exit(1);
}

// Ces variables passent avant celles du .env (Node et Vite ne remplacent pas une variable déjà définie).
const env = {
  ...process.env,
  DEV_LAN: '1',
  API_URL: `http://${ip}:3000`,
  WEB_URL: `http://${ip}:5173`,
  VITE_API_URL: `http://${ip}:3000`,
  S3_ENDPOINT: `http://${ip}:9000`,
};

console.log(`\nOuvrez http://${ip}:5173 sur le téléphone (et sur ce poste, pas localhost).\n`);
const child = spawn('pnpm', ['dev'], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
