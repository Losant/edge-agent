import { nock } from './common.js';
import { format } from 'omnibelt';
import fixtureData from './__fixtures__/google-big-query-node/static.js';
import GoogleBigQueryNode from '../src/google-big-query-node.js';
import {
  DATA_METHOD_PAYLOAD_PATH,
  DATA_METHOD_JSON_TEMPLATE
} from '../src/lib/constants.js';

const { validData, invalidData } = fixtureData;

describe('GoogleBigQueryNode', () => {
  describe('with auth mock', () => {
    beforeEach(() => {
      nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
        .post('/token')
        .reply(200,
          { access_token: validData.accessToken, expires_in: 3600, token_type: 'Bearer' },
          [ 'Content-Type', 'application/json; charset=utf-8' ]
        );
    });

    it('jobs.query :: valid request with a projectIdTemplate different from the one on jwt', async function() {
      const { jwt, singleResultQueryRequest } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/foo-bar/queries', { kind: 'bigquery#queryRequest', maxResults: 10, query: "SELECT * FROM [for_testing_only.gsod1929_copy] WHERE stn = '031590' AND year = '1929' AND mo = '10' AND da = '20' LIMIT 10" })
        .reply(200, '1f8b0800000000000013b5575b6fda30147ee757a0ec95450db465d95b3bb10e09b10ae8aa6d4291b14fc0ccb133db29858affbedc687920932b6c1e20e7f67de77c44bebcb4da6def0fe5c4fbdcf61674f93703b9fd507e4f40a5822bf03a458ec22b48509ef5925bb91d536044e5f6efd26ed7fe32c65102059ed2bc2caedd7a9b96eee96c321cdf1d471241cac8f86134bab91d0dbc3ab4ef34836f16c821fa169074879e0877d804b9c3d690a4a7d0bf8ebedfccce05c722e33a6aa2188e6783bbc1e46c7560e37a82260a4b1328e67a8006065bfd6be7fd9f66b0d4ff135574e17882460e4b336c883a29919d55a29ac12d47f29c2ae20e7e9929edec3f4ed0b333ec98a165d4406049797a72dbb5d8fd69023bdda712bb5b7ecaf69b18ecf4af3871d8bf58baeb5c22ca2322e96ec7c0a53e6213510c510a8c8156ee985688328727ad55c609383c826a213922228a33ce81459889ecdcf5b4fc9db76a5e6f2d1613884102c7f0766f48a55803d643529d2795fe9832b45dca7ccf38f01795553c7f88c4b546eb1f033ecea61aff1cfc9af6c8e3e32afe14edfaf787022630d254f0a2e661eabdb6a085466c2236c53dc50baa8b8caccceada7210c68b8f6e32c77ae5a1a7a2f8a2175c8517deab7fdff94f72587c0c7383b06b9c6acadf354dbcecfb3dd354d3bcae75c8300c7c538dcc31c3d018d454cea0eb1bcb640a79e9f72d43767bc683bf47a4ab9e1f98a5f28c31c391ae7d43edcd318b910c677a0fa883b7c9329ecbbcfa69de3a58f3b7f5f7769b2ff3f75260500a485579d820be8824cdb7e9627fd03283d28d115ec137aa6b5f6bdffa078cf26bfda5120000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest),
        projectIdTemplate: '{{ project }}'
      });

      const [outputIds, payload] = await node.run({}, { jwt, project: 'foo-bar' });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('rows');

      const { kind } = result;

      kind.should.equal('bigquery#queryResponse');
    });

    it('jobs.query :: valid request', async function() {
      const { jwt, singleResultQueryRequest } = validData;
      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/queries', { kind: 'bigquery#queryRequest', maxResults: 10, query: "SELECT * FROM [for_testing_only.gsod1929_copy] WHERE stn = '031590' AND year = '1929' AND mo = '10' AND da = '20' LIMIT 10" })
        .reply(200, '1f8b0800000000000013b5575b6fda30147ee757a0ec95450db465d95b3bb10e09b10ae8aa6d4291b14fc0ccb133db29858affbedc687920932b6c1e20e7f67de77c44bebcb4da6def0fe5c4fbdcf61674f93703b9fd507e4f40a5822bf03a458ec22b48509ef5925bb91d536044e5f6efd26ed7fe32c65102059ed2bc2caedd7a9b96eee96c321cdf1d471241cac8f86134bab91d0dbc3ab4ef34836f16c821fa169074879e0877d804b9c3d690a4a7d0bf8ebedfccce05c722e33a6aa2188e6783bbc1e46c7560e37a82260a4b1328e67a8006065bfd6be7fd9f66b0d4ff135574e17882460e4b336c883a29919d55a29ac12d47f29c2ae20e7e9929edec3f4ed0b333ec98a165d4406049797a72dbb5d8fd69023bdda712bb5b7ecaf69b18ecf4af3871d8bf58baeb5c22ca2322e96ec7c0a53e6213510c510a8c8156ee985688328727ad55c609383c826a213922228a33ce81459889ecdcf5b4fc9db76a5e6f2d1613884102c7f0766f48a55803d643529d2795fe9832b45dca7ccf38f01795553c7f88c4b546eb1f033ecea61aff1cfc9af6c8e3e32afe14edfaf787022630d254f0a2e661eabdb6a085466c2236c53dc50baa8b8caccceada7210c68b8f6e32c77ae5a1a7a2f8a2175c8517deab7fdff94f72587c0c7383b06b9c6acadf354dbcecfb3dd354d3bcae75c8300c7c538dcc31c3d018d454cea0eb1bcb640a79e9f72d43767bc683bf47a4ab9e1f98a5f28c31c391ae7d43edcd318b910c677a0fa883b7c9329ecbbcfa69de3a58f3b7f5f7769b2ff3f75260500a485579d820be8824cdb7e9627fd03283d28d115ec137aa6b5f6bdffa078cf26bfda5120000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('rows');

      const { kind } = result;

      kind.should.equal('bigquery#queryResponse');
    });

    it('jobs.query :: invalid request', async function() {
      const { jwt } = validData;
      const { singleResultQueryRequest } = invalidData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/queries', { kind: 'bigquery#queryRequest', query: 'SELECT * FROM [invalid_dataset.invalid_table] LIMIT 1' })
        .reply(404, '1f8b0800000000000013bd8fb10ac2301086f73ec59159c1a153e7d2b11db49348399b5802694e72a922a5ef6e1223f8044ee1bf2fb9efcf5a0008e51c3951c11a4288234915527928779fc1ac98718a33d192871b2d565650a347561ebc62bfbf1b7c4d2e016d1f68b41c64e64f64b0df67a02d181ad16bb2d01f4536a4061c04e7942157f98f3d5924cda86d944c86ae687e9953c89458d8d4c44522c32d9d97fc0bf6e8174e45bbd3d0747d5bc78b5bb1156f274c44ca68010000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('error');
    });

    it('datasets.get :: valid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only')
        .reply(200, '1f8b08000000000000139591516bc2301485dffd1592bd3a6385e22608535644d856a8db648c21597adb65a64d4de26a27fef72569873044dc4b1eee39f73b27c9aed56ea315cb63346ca37796ae3720ab8b9868a240a38e554193d4aabd6d15ce07e53c4c27fdf5775079d397f173391ad52ee6081a94be2c38a9522936793c4c845cda19cbd3a5c879557b15f0e48ee52bbbf1a175a186189765d94d8548399082a92e1519fead83bffab890e213a856f84f026eaa2a7c3caa91234840424ec144eeccfca0cc5cefa3cbc6d4c4ce8e5d0e19cbde85104a41296379755b7580994bc16d205a44b3c7206a98f6fe055046f8d4600aab37290bc93448859c6ddf39ce0a170f67a0c232ff2f69a3404eaa20238c5b5558c20d6c495670b0df711a1605e3db337a4540e2433173beb907a4128866227f6499a379bee75d0fbc2bbfe7fb7efd919c287d2f629630884fd90475242b3fcd516bdffa01a6633e23e2020000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'get',
        datasetId: 'for_testing_only'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('datasetReference');

      const { kind, datasetReference } = result;

      kind.should.equal('bigquery#dataset');

      datasetReference.should.deepEqual({
        projectId: 'test-playground',
        datasetId: 'for_testing_only'
      });
    });

    it('datasets.get :: invalid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/invalid_dataset_id')
        .reply(404, '1f8b0800000000000013ad8e310ac3300c45f79c42786ea143a6cc2163b2b4532941addd6070ac6229851272f7da8e871ea093f87ae27dad1580322150500dac31c4f8206d62aa4ff5615fcc8619a7b4533d093c69f1ba811605d908886139be1c7ea69081f56f74568f7ae7a3d5aa78720f47cd35672885ffecc82e4d335a9f5493a33bba5f160c3265e649ba2453056e79decaaf2c280be77786f3d80d97be4d875bb5555f7b32198534010000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'get',
        datasetId: 'invalid_dataset_id'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('error');
    });

    it('datasets.list :: valid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets')
        .reply(200, '1f8b0800000000000013cd91418bc2301085effd15215e5710c18382074170853d55c4c32225b6d374766bd2a6112de27f3749a382a807bb87bd0c24ef7bf378cc312084fea248e888d00df27207aaee244cb30af417569a7e580234e396f89ca60cfa59b62cc3d56c98a4bd558883c978dc50de5619f2dbbc0939baf922c1f91c814ed750e96e91b39a2bb913c90804470191a56fa8f7869082021183315e826eeadced7be4374ca1e40fc49eb9cba41e3b5df37219338d525878b96874afb62e984a15d93f143c9222afdf6af974c9bfaaba078c3386111cd8b6c85b1cf5e5a2bfa96ce63a3805674d0d9d5d1e030000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'list'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('datasets');

      const { kind, datasets } = result;
      const [dataset] = datasets;

      kind.should.equal('bigquery#datasetList');
      dataset.should.have.properties(['kind', 'id', 'datasetReference']);
    });

    it('datasets.insert :: valid request', async function() {
      const { jwt, insertDatasetRequest } = validData;
      const { datasetReference: originalDatasetReference } = insertDatasetRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/datasets', { kind: 'bigquery#dataset', datasetReference: { projectId: 'test-playground', datasetId: 'auto_generated_dataset' }, description: 'insert' })
        .reply(200, '1f8b08000000000000139551d14ec240107ce72b487d145a41402521516243302ab1a04d34869cd7e5dc527af5ee4a4308ffee5d5b422484e04b93db99ceccceae2bd5aa35c738b0ba55eb0bd94f0a62751610452428ab6650508419f4ed62c042f7dc0f9b57ec61fceee253a71fbef47a050b73050552d59388ac98e0691c7449aaf894410c822808a67f742544b3478ce7e6bf6fa512d9759c2ccb6cc6398b8024286dca17ce3694b36c3a89e02150259d3d1fa71496ce31c3f2e1c10c04c414b4f15acf77c830dfe18884a696118687d6b53465535881a40213853c363c8c25883205a114a4d4d38f5cb048a0e782472691e57bc389eb9576a6a604289268a01d128397017c810a84b472daa676586be43f9f2035cae2ff2aa57a9ffeca5d108c0cca6852375ddcee15622359d84c739748412fae67ca1cf5b897e7dedd9f10db0312ec72ebef67de2f15404cef135ce46a8d76bbddbc6eb51a9d9bcb7671828848f5c4039c2104c7689c92ed055fc7566553f905f46956ba2e030000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'insert',
        dataset: JSON.stringify(insertDatasetRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('datasetReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, datasetReference, id, description } = result;

      kind.should.equal('bigquery#dataset');
      datasetReference.should.deepEqual(originalDatasetReference);
      id.should.equal(format('{projectId}:{datasetId}', originalDatasetReference));
      description.should.equal(insertDatasetRequest.description);
    });

    it('datasets.update :: valid request', async function() {
      const { jwt, insertDatasetRequest, updateDatasetRequest } = validData;
      const { datasetReference: originalDatasetReference } = insertDatasetRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .put('/bigquery/v2/projects/test-playground/datasets/auto_generated_dataset', { kind: 'bigquery#dataset', datasetReference: { projectId: 'test-playground', datasetId: 'auto_generated_dataset' }, description: 'update' })
        .reply(200, '1f8b08000000000000139551616bc23014fceeaf90ece3b45567d509c2365686e0ecd639dc184362faec32db264b528b88ff7d495b918988fb52c8bbebddbd7b9b4ab58a96340950bf8ae634fc4941ac2f02acb004856a0605854383ae2e9be95b309e8fbd77c1ddd113f7ba0dfa3c18142c9a2b2890aace23bc0e054b93a08f53c566212420b08260f6475742b418d16469fefb528acbbe6d675966858c8511604ea545586cef42d9ab96cd05fb06a2a47de06397c2d23e65583e7c588080848036dee8f91e19e63b9c90d0d432c2f0d8ba4853b68515482228579425869772ad02450a4c0848a9a71fb9609140cf058b4c2234f58713d72fed4c4d1c08c5d18376e0062f034c05552024ca69dbda712d6f3a3e43cacb92ff2aa512c4ddda8d318d0c1a125e375ddc1c1462511c5ba1e6ae2801bdb89e2973d4d35ebe7b7b7f466c1f70b0cfadbf9f79bf440036bd4f689cab351dc769f5da8ed3bdbeea142788b0548f2ca00b0ac121addb69377a258d11bcbbe0eb0baa6c2bbf7c24c13e2e030000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'update',
        datasetId: originalDatasetReference.datasetId,
        dataset: JSON.stringify(updateDatasetRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('datasetReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, datasetReference, id, description } = result;

      kind.should.equal('bigquery#dataset');
      datasetReference.should.deepEqual(originalDatasetReference);
      id.should.equal(format('{projectId}:{datasetId}', originalDatasetReference));
      description.should.equal(updateDatasetRequest.description);
    });

    it('datasets.patch :: valid request', async function() {
      const { jwt, insertDatasetRequest, patchDatasetRequest } = validData;
      const { datasetReference: originalDatasetReference } = insertDatasetRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .patch('/bigquery/v2/projects/test-playground/datasets/auto_generated_dataset', { description: 'patch' })
        .reply(200, '1f8b080000000000001395915f6bc23014c5dffd14d23d4e1bd4d57f204c996cc29cac53641b43b2f4b666d62626a9a588df7d495b9189887b29e4ded3df39f7de5da95cb65634f2ac6ed9faa6c1260691de78586109caaa982e281c98ee64e5a71f1beffd69f67adb44b5fe78b0a9f1a4d7cb5534232890aaca439c0682c591d7c5b1628b0022105881b7f8c39510facf345a99ff964a71d9452849123b602c0801732a6dc2d6e8100a6deb880bf603444974e2830ab044970c8b870b3e08880868e39dae1f3ba36c860b082d2d228cce8d6b69c93eb7024904e58ab2c8e83856649987c0848094baf899f1f200ba2e586802597377341dba859bd912074271f8a80d7886cafde7822a10d2ca64fbca79d664fe72056a9244ff25c512c4201dae310d4d3720bc6a56717fb20f9be2b51d68ed9612d083eb9a3237bdece50efb0f57c476017bc7dcfafb95ed9708c066ed53bace6835c771eaed3bc769751acdfc0421966acc3cea53f04e64cd56bbd1e8143246f0e180b337abb42ffd02abd2026c2d030000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'patch',
        datasetId: originalDatasetReference.datasetId,
        dataset: JSON.stringify(patchDatasetRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('datasetReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, datasetReference, id, description } = result;

      kind.should.equal('bigquery#dataset');
      datasetReference.should.deepEqual(originalDatasetReference);
      id.should.equal(format('{projectId}:{datasetId}', originalDatasetReference));
      description.should.equal(patchDatasetRequest.description);
    });

    it('datasets.delete :: valid request', async function() {
      const { jwt, insertDatasetRequest } = validData;
      const { datasetReference: originalDatasetReference } = insertDatasetRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .delete('/bigquery/v2/projects/test-playground/datasets/auto_generated_dataset')
        .query({ deleteContents: 'false' })
        .reply(204, '', [ 'Content-Type', 'application/json; charset=UTF-8' ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'datasets',
        action: 'delete',
        datasetId: originalDatasetReference.datasetId,
        deleteContents: false
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.deepEqual({ success: true });
    });

    it('tables.get :: valid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/empty_table')
        .reply(200, '1f8b08000000000000137d8fdd4fc23014c5dff92b96f9aa94f9113e121ec01845278930888931a4ac77a5b2b5732d2e0be17fb76b375d90f8b4f59c73efefdc7dcb71dc2de3c41d38ee9ad1cf1d64c599c2eb18dcf3d2038569e979f327baeddef69729597a8f45f7e175f1d21b0d8736c5ccbc02a92ed2181734133b4e0691c856a5c6385d091e176d485255ac1adb25c491cff8b69cde2895ca0142799eb7a91034069c32d90e4582ea62e8eb12a599f8805049744443042b2c411bc758648012fda19bdf194490010f4177d86b55eb156272ea2833a93315cd668e8975c8006ca409d7e6c19e1f6e20c1bfe088414ca47ebf99b753e9c6e33801cb12d57a8b285223cf83d9647adf7412418c335df8fe68ecdfb9957530dff79f127c978c0bddbecc76dc5af205a70164a7ac99c89b4a9801564cf080d982de8de7f5bb5eafd7e95f5ddb488ca57a1684e9fbc83fb1fa96c0d4b5932234cb4b7931775b87d63799a477f2b2020000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'get',
        datasetId: 'for_testing_only',
        tableId: 'empty_table'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('tableReference');

      const { kind, tableReference } = result;

      kind.should.equal('bigquery#table');

      tableReference.should.deepEqual({
        projectId: 'test-playground',
        datasetId: 'for_testing_only',
        tableId: 'empty_table'
      });
    });

    it('tables.get :: invalid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/invalid_table_id')
        .reply(404, '1f8b0800000000000013b58e310bc3201085f7fc0a716e4b874c994bc66449a750e4528d08c62b9e298490ff5eb50efd039d8ef7def1bdb7578c71e53d7adeb03d8a289f285554f5b53e7d8d4511814e1eef30b01957271b36c064150b8ac2f96561d33edb337a913ce3b44067b78b716fb0468a90de8591bc40732945e698352bed7f2bcc60890b1897b8dae204f637f30a0873e630b489cd4b78e4fb28c3294058296feb07d1f6f7ee961e8feaa83e58936cbc4e010000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'get',
        datasetId: 'for_testing_only',
        tableId: 'invalid_table_id'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('error');
    });

    it('tables.list :: valid request 1', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables')
        .reply(200, '1f8b0800000000000013cd53d14ac330147ddf5794faaad2b4ddd60cf6a03064507d1843109192a57721da265d9a2161ecdf4dd3ea66d1a729fa72e1e69c7beee190bb1b789effc245ee4f3c7fc5d9660bca9c69b22a20e5b5f6cf1b1c34610d6ee82cd92c1ee8ddfd38486f6f148d5e69c4a6d396e5866acb7bb49de7ed5cfd56ddcd389c3b5443ad2faa8218a6e456e493b55459f3c605cba428cc25949536596fd6b50b58830241c1eabc6fb558a5e433503dff4afe43c1f272a2490d1dafbff698e896b5b463331d617f3065aac68abfbcba4e6707af5401d15c8a252f1d8c8608e1314a92004771abd269fc7474ac9639c221cea8acccdf87f7d9ce69f185011a26e1e857e3135264ffeaf7f50d9d16211ec531466117a1ad4fed394b4d8ab986b239e968b01fbc012d1eaf8a2b040000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'list',
        datasetId: 'for_testing_only',
        maxResults: ''
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('tables');

      const { kind, tables } = result;
      const [table] = tables;

      kind.should.equal('bigquery#tableList');
      table.should.have.properties(['kind', 'id', 'tableReference', 'type', 'creationTime']);
    });

    it('tables.list :: valid request 2', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables')
        .query({ maxResults: '10' })
        .reply(200, '1f8b0800000000000013cd53d14ac330147ddf5794faaad2b4ddd60cf6a03064507d1843109192a57721da265d9a2161ecdf4dd3ea66d1a729fa72e1e69c7beee190bb1b789effc245ee4f3c7fc5d9660bca9c69b22a20e5b5f6cf1b1c34610d6ee82cd92c1ee8ddfd38486f6f148d5e69c4a6d396e5866acb7bb49de7ed5cfd56ddcd389c3b5443ad2faa8218a6e456e493b55459f3c605cba428cc25949536596fd6b50b58830241c1eabc6fb558a5e433503dff4afe43c1f272a2490d1dafbff698e896b5b463331d617f3065aac68abfbcba4e6707af5401d15c8a252f1d8c8608e1314a92004771abd269fc7474ac9639c221cea8acccdf87f7d9ce69f185011a26e1e857e3135264ffeaf7f50d9d16211ec531466117a1ad4fed394b4d8ab986b239e968b01fbc012d1eaf8a2b040000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'list',
        datasetId: 'for_testing_only',
        maxResults: '10'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');
    });

    it('tables.list :: invalid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/invalid_dataset_id/tables')
        .reply(404, '1f8b0800000000000013ad8e310ac3300c45f79c42786ea143a6cc2163b2b4532941addd6070ac6229851272f7da8e871ea093f87ae27dad1580322150500dac31c4f8206d62aa4ff5615fcc8619a7b4533d093c69f1ba811605d908886139be1c7ea69081f56f74568f7ae7a3d5aa78720f47cd35672885ffecc82e4d335a9f5493a33bba5f160c3265e649ba2453056e79decaaf2c280be77786f3d80d97be4d875bb5555f7b32198534010000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'list',
        datasetId: 'invalid_dataset_id'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('error');
    });

    it('tables.insert :: valid request', async function() {
      const { jwt, insertTableRequest } = validData;
      const { tableReference: originalTableReference } = insertTableRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables', { kind: 'bigquery#table', tableReference: { projectId: 'test-playground', datasetId: 'for_testing_only', tableId: 'auto_generated_table' }, description: 'insert' })
        .reply(200, '1f8b08000000000000137590414fc2301886effc0a528f2a95851124e120d1830612453c785a4afbad54b676b61dcb42f8efb6dd9610326fcbf73edf9ef7eb69301ca283900ccd876827f86f09babeb1649701baf31958c27d767cfebe35e5e4f190e6513d59bfbdb3f873fab158349408fb168cbd2f325273ad4ac9e6a9d2899f09c91325b37a444aab120e1234b1c0920b8d812c5d0979f0bfd95b5b9839c655558db8523c03520833a22ac75d437c8c70a1d50f506bf0951633628901175cfb71101afc7f8df0b9811434480aaeccc94dddbc75bdf69d19361dd36a1be65add4141d020bd2d1c750e4d1818aa456185921e16d280b6ed5bd13de4c4976b5059e6cbdac93cf780bad14a49be05dd176d547539a11a88f76c45ee4f46e3388ea3591c45b3c978da20193176ad984805b01e6c3a6e9faf2e42b47d5aae5eda4d454977c4d7271a9c077ff82a0f4673020000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'insert',
        datasetId: originalTableReference.datasetId,
        table: JSON.stringify(insertTableRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('tableReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, tableReference, id, description } = result;

      kind.should.equal('bigquery#table');
      tableReference.should.deepEqual(originalTableReference);
      id.should.equal(format('{projectId}:{datasetId}.{tableId}', originalTableReference));
      description.should.equal(insertTableRequest.description);
    });

    it('tables.update :: valid request', async function() {
      const { jwt, insertTableRequest, updateTableRequest } = validData;
      const { tableReference: originalTableReference } = insertTableRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .put('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/auto_generated_table', { kind: 'bigquery#table', tableReference: { projectId: 'test-playground', datasetId: 'for_testing_only', tableId: 'auto_generated_table' }, description: 'update' })
        .reply(200, '1f8b08000000000000137590cd4ec3301084ef7d8a2a5ca126a6a94aa51ea840801438f4078953e4c61be336b183ed104555df1ddb495115959b35f3edceac0f83e130d8734183d930d872f65d816aae0cd9e6105c3b0f0c61ce8bdf578f1f936c3f0e5feac573f5b9e3312eeaf9bca5b89f37a0cd4d9993862959093acba44a9cc6054ba4c89b11a98c4c180850c4004dce6234e459ccc5deadf932a6d43384eaba1e3129590ea4e47a94ca029d1aa21f8c4a2577901a8d7ab18812433458a39f8f7ca046ffd7f0cf2564a040a460cb1cac6af52eebf5d2997ed2325d6ccbf4a34f900f68918b2d2c75f44d28e854f1d270291c5c95767d575254c5a2b1cb9d7efb27c552b035a84bd652d6e74aaa80b8bd6b5eb81383308a223c8d309e8ec3498be4449b374979c681f6b0bb10e3fbb0fbaea6f4d6fa61113f75933225a7d29b5530380e7e01c45ad87c63020000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'update',
        datasetId: originalTableReference.datasetId,
        tableId: originalTableReference.tableId,
        table: JSON.stringify(updateTableRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('tableReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, tableReference, id, description } = result;

      kind.should.equal('bigquery#table');
      tableReference.should.deepEqual(originalTableReference);
      id.should.equal(format('{projectId}:{datasetId}.{tableId}', originalTableReference));
      description.should.equal(updateTableRequest.description);
    });

    it('tables.patch :: valid request', async function() {
      const { jwt, insertTableRequest, patchTableRequest } = validData;
      const { tableReference: originalTableReference } = insertTableRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .patch('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/auto_generated_table', { description: 'patch' })
        .reply(200, '1f8b08000000000000137591cd6ec2301084ef3c054aaf2d86b4e14fe2006a452bc185a6e7c8381bc725d8a9bd699422debd76122a14d19b35f3edced83ef5fa7def2064eccdfbde5ef0af02747587749f8177ef3c40ca9d5760a00fafcf813f1dae53b3fec1c96c9b2e178b8612f53c82c1873ca315d7aa90f13c513a729a903c5232ab06b440157190a029421c5dc518c8928d9007b72645cccd9c90b22c075c299e01cd85193075249786e4db27b9569fc0d0904e2c89295203d6e8e6933ad090ff6bd4c71d24a04132b0654e56b57a9bf576eb9af5a465dad886e9465fa03aa0416eb6b0d4b96e1283615ae4289474704e91a54d47591c5795ddede4e19fb4519287a06f593b555e2b4c03756b43717437f44641607f35f0fde9d368dc201935b855b14804c41dec7136f627a3f6b5aabcb6c2e56af3d24e2a462f9d3fdebddeb9f70b1a87c58162020000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'patch',
        datasetId: originalTableReference.datasetId,
        tableId: originalTableReference.tableId,
        table: JSON.stringify(patchTableRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('tableReference');
      result.should.have.property('id');
      result.should.have.property('description');

      const { kind, tableReference, id, description } = result;

      kind.should.equal('bigquery#table');
      tableReference.should.deepEqual(originalTableReference);
      id.should.equal(format('{projectId}:{datasetId}.{tableId}', originalTableReference));
      description.should.equal(patchTableRequest.description);
    });

    it('tables.delete :: valid request', async function() {
      const { jwt, insertTableRequest } = validData;
      const { tableReference: originalTableReference } = insertTableRequest;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .delete('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/auto_generated_table')
        .reply(204, '', ['Content-Type', 'application/json; charset=UTF-8' ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tables',
        action: 'delete',
        datasetId: originalTableReference.datasetId,
        tableId: originalTableReference.tableId
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.deepEqual({ success: true });
    });

    it('tabledata.list :: valid request', async function() {
      const { jwt } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .get('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/empty_table/data')
        .reply(200, '1f8b08000000000002ffabe6525050cacecc4b51b252504aca4c2f2c4d2daa542e494cca4975492c49f4c92c2e51d201a9492d494c07a989a8aa2c4f8fcc34b2c82e4cf775c93389287137a94cb7b585a82ac92f49cc09ca2f2f06293550e2aae5020039c0b86161000000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tabledata',
        action: 'list',
        datasetId: 'for_testing_only',
        tableId: 'empty_table'
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('totalRows');

      const { kind } = result;

      kind.should.equal('bigquery#tableDataList');
    });

    it('tabledata.insertAll :: valid request', async function() {
      const { jwt, insertTableDataRequest } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/datasets/for_testing_only/tables/non_empty_table/insertAll', { kind: 'bigquery#tableDataInsertAllRequest', skipInvalidRows: true, rows: [{ insertId: '1', json: { foo: 'bar' } }] })
        .reply(200, '1f8b08000000000002ffabe6525050cacecc4b51b252504aca4c2f2c4d2daa542e494cca4975492c49f4cc2b4e2d2a71ccc9094a2d2ec8077294b86ab9002c8131a934000000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'tabledata',
        action: 'insertAll',
        datasetId: 'for_testing_only',
        tableId: 'non_empty_table',
        tableData: JSON.stringify(insertTableDataRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');

      const { kind } = result;

      kind.should.equal('bigquery#tableDataInsertAllResponse');
    });

    it('should work if `jwtDataMethod` is `payloadPath`', async function() {
      const { jwt, singleResultQueryRequest } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/queries', { kind: 'bigquery#queryRequest', maxResults: 10, query: "SELECT * FROM [for_testing_only.gsod1929_copy] WHERE stn = '031590' AND year = '1929' AND mo = '10' AND da = '20' LIMIT 10" })
        .reply(200, '1f8b0800000000000013ad57516fda30107ee757a0ecb58b9a00abb2b7b6630c09b189d23d6caa22131f60ead8a9ed2ca555fffbec04266d24aee63a0f567c77dfe7ef1cf97c79eef5837bc270f0b11facc8e6a104b17f578f0b9005671282331d22b32de448073df7fafd604d8062a9673ff5ac36692343391816a998811893da17b5e966b998ce27476bce716d9ddfce669757b37160cc2f672d54d50a79e3da0312beb872ee8b09235f4c0af2e25faecfb3af97cbffa7ca78c954da46389d2fc793f1c2214fa8fcaa6b23745627a95f712d7ceeda94676da77cceda7e1149565ed5b5323aebabb03c49d6f57c35fa7c32e68f85c4bec836a5549ebe448e1e3d31ad29daa42d74ce3b464eae8337293ba573555688ccd731ada5b5f1b96a930c7bd3c637be540944588a05797aa2e02f535ea52483b4004a41495fbc5b44a8b77b7a5b320cde5a11c5054398a7eb9231a0694679e95453f470d7ab9708767cb580350860191c3bbe42f01d646a8a9b5643aaf70545fb8dd045b159cea01aaf7e4993e176baba2e7f4c77ea7ef26909a3e201be0b3a58aa59d584539e2145383388db9be0b0b4e20ad105af4c6f194475e7299a99e934ebd483f5b1ef3c6c85be864cf4f9201a25e77532879dfadb9f98a7db1d25b1cd6b218e2dbee14538b0782daed8119824516849c48a4c121bd492661487b65c2cc06178e1048c0736a9af64321a8451a7979594762bfa10766f83156914754b7a05eafc5d9c506f7399515712f372f7e7485fed75cdf826780652026ec20fa5e69ae785aed5a6d2285182b16648ff6d7e21ea60eabdf47e034d69c08ea60e0000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      const [outputIds, payload] = await node.run({}, { jwt });

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('rows');

      const { kind } = result;

      kind.should.equal('bigquery#queryResponse');
    });

    it('should work if `jwtDataMethod` is `jsonTemplate`', async function() {
      const { jwt, singleResultQueryRequest } = validData;

      nock('https://bigquery.googleapis.com:443', { encodedQueryParams: true })
        .post('/bigquery/v2/projects/test-playground/queries', { kind: 'bigquery#queryRequest', maxResults: 10, query: "SELECT * FROM [for_testing_only.gsod1929_copy] WHERE stn = '031590' AND year = '1929' AND mo = '10' AND da = '20' LIMIT 10" })
        .reply(200, '1f8b0800000000000013ad57516fda30107ee757a0ecb58b1a425b656fedc63a24442ba0d2a6a98a4c7c80996367b6d334adfadf6b27306923b89aeb3c58f1dd7d9fbf73e4f3e5b9d70f7e1186834ffd6049d6bf4b10f587669c812c3893109ce810996d20473ae8b9d7ef072b02144b3dfba9678d491b19cac1b048c50cc498545d34a6f962369e5eefad39c78d757a37995c5e4d468131bf9c7450554be48dab06247c71e5dc171346be9814e4c5bf5c5f2737978bffa7ca78c954da45389e2e46d7a399439e50f955d745e8ac4e52bfe23af8dcb529cfda0ef99cb53d1049965ed575323aebabb03c48d6f57cb5fa7c32e68f85c4bec8d6a5549ebe448e1e3d31ad285aa71d74ce3b460eae8377293ba473555688ccd7316da475f1b96a930c7bd3c6d7be540944588a05797aa2e02f535ea52483b4004a41495fbc1b44a8b77b7a53320cde5a11c5054398a7ab9231a0694679e95453f470df6b9608b67c398315086019ec3bbe42f02d646a8cdb5643aa8f0545f55ae8a2d82e6750ad57bfa43f6ebedfc67505e3edc37cc2a42ce95055f3783b3d1f7f69c329cf90229c19c4dd3cd82dadb84274c62bd35b0651d3798a76663acd26f560b5ef3b775ba1af21137d1a4767c96993cc6ea7fef627e639ee8e9281cd6b211e587cc38b30b6782dae81233049a2d0928815992436a825cd6810da72b10087e185137010dba4be91c9591c4647bdaca4f4b8a2f3f0f836589146d171496f409dbf8b13ea7d2e33ea4a625eeeff1ce9ab5ad78c5bc1339012701bbe2b359f795ee85a6d2a8d1225186b86f4dfe637a276a6de4bef158ad4ea9ba60e0000', [
          'Content-Type', 'application/json; charset=UTF-8',
          'Content-Encoding', 'gzip'
        ]);

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
        jwtJsonTemplate: JSON.stringify(jwt),
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      const [outputIds, payload] = await node.run({}, {});

      outputIds.should.deepEqual([[4]]);
      payload.should.have.property('result');

      const { result } = payload;

      result.should.have.property('kind');
      result.should.have.property('rows');

      const { kind } = result;

      kind.should.equal('bigquery#queryResponse');
    });
  });

  describe('error cases', () => {
    it('should throw a NodeTimeoutError if fetch promise times out', async function() {
      const { jwt, accessToken, singleResultQueryRequest } = validData;

      nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
        .post('/token')
        .optionally()
        .delay(50)
        .reply(200,
          { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
          { 'Content-Type': 'application/json; charset=utf-8' });

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
        jwtPayloadPath: 'jwt',
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      await node.run({ externalTimeout: 50 }, { jwt })
        .should.be.rejectedWith({ name: 'NodeTimeoutError' });
    });

    it('should throw an InvalidEnumValue for invalid jwtDataMethod value', async function() {
      const { jwt, singleResultQueryRequest } = validData;

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: 'not a valid data method',
        jwtJsonTemplate: jwt,
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      await node.run({}, {}).should.be.rejectedWith({ name: 'InvalidEnumValueError' });
    });

    it('should throw an AuthenticationError for invalid credentials', async function() {
      const { singleResultQueryRequest } = validData;
      const { jwt } = invalidData;

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
        jwtJsonTemplate: jwt,
        resultPath: 'result',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      await node.run({}, {}).should.be.rejectedWith({ name: 'AuthenticationError' });
    });

    it('should throw a InvalidJsonError if JWT is an empty string', async function() {
      const { singleResultQueryRequest } = validData;
      const jwt = '';

      const node = new GoogleBigQueryNode('id', [[4]], {
        jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
        jwtJsonTemplate: jwt,
        resultPath: 'results',
        resource: 'jobs',
        action: 'query',
        queryRequest: JSON.stringify(singleResultQueryRequest)
      });

      await node.run({}, {}).should.be.rejectedWith({ name: 'InvalidJsonError' });
    });
  });

});
