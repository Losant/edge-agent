import nock from 'nock';
import axios from '/Users/erin/Documents/git/edge-agent/node_modules/.pnpm/axios@1.21.0_debug@4.4.3_supports-color@8.1.1__supports-color@8.1.1/node_modules/axios/index.js';

nock.disableNetConnect();

for (let i = 0; i < 30; i++) {
  nock.cleanAll();
  nock('https://k8s.example.com:6443')
    .get('/api/v1/pods')
    .reply(200, { items: [] });
  try {
    const res = await axios.get('https://k8s.example.com:6443/api/v1/pods');
    console.log(i, 'success', res.status);
  } catch (e) {
    console.log(i, 'FAILED:', e.message);
  }
}
