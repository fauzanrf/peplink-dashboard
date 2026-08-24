import { fetchLiveGpsData } from './src/lib/peplink';

async function run() {
  require('dotenv').config({ path: '.env.local' });
  const data = await fetchLiveGpsData();
  console.log(JSON.stringify(data, null, 2));
}
run();
