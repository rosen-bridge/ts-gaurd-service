import {
  Address,
  BlockHeaders,
  BoxSelection,
  Contract,
  ErgoBox,
  ErgoBoxAssetsDataList,
  ErgoBoxCandidates,
  ErgoBoxCandidate,
  ErgoBoxes,
  ErgoStateContext,
  PreHeader,
  SecretKey,
  SecretKeys,
  Tokens,
  TransactionHintsBag,
  TxId,
  Wallet,
  ErgoBoxCandidateBuilder,
  TxBuilder,
  TokenAmount,
  TokenId,
  BoxValue,
  I64,
} from 'ergo-lib-wasm-nodejs';
import TestUtils from '../../testUtils/TestUtils';
import { Asset } from '@rosen-bridge/scanner/dist/scanner/ergo/network/types';
import { TxQueued } from '../../../src/guard/multisig/Interfaces';
import * as wasm from 'ergo-lib-wasm-nodejs';

const mockedBlockHeaderJson = Array(10).fill({
  extensionId:
    '0000000000000000000000000000000000000000000000000000000000000000',
  difficulty: '5275058176',
  votes: '000000',
  timestamp: 0,
  size: 220,
  stateRoot:
    '000000000000000000000000000000000000000000000000000000000000000000',
  height: 100000,
  nBits: 0,
  version: 2,
  id: '0000000000000000000000000000000000000000000000000000000000000000',
  adProofsRoot:
    '0000000000000000000000000000000000000000000000000000000000000000',
  transactionsRoot:
    '0000000000000000000000000000000000000000000000000000000000000000',
  extensionHash:
    '0000000000000000000000000000000000000000000000000000000000000000',
  powSolutions: {
    pk: '03702266cae8daf75b7f09d4c23ad9cdc954849ee280eefae0d67bd97db4a68f6a',
    w: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    n: '000000019cdfb631',
    d: 0,
  },
  adProofsId:
    '0000000000000000000000000000000000000000000000000000000000000000',
  transactionsId:
    '0000000000000000000000000000000000000000000000000000000000000000',
  parentId: '0000000000000000000000000000000000000000000000000000000000000000',
});

const mockedBlockHeaders = BlockHeaders.from_json(mockedBlockHeaderJson);

export const mockedErgoStateContext: ErgoStateContext = new ErgoStateContext(
  PreHeader.from_block_header(mockedBlockHeaders.get(0)),
  mockedBlockHeaders
);

const mockErgoBoxCandidate = (
  value: bigint,
  assets: Asset[],
  boxContract: Contract
): ErgoBoxCandidate => {
  const inBox = new ErgoBoxCandidateBuilder(
    BoxValue.from_i64(I64.from_str(value.toString())),
    boxContract,
    100000
  );
  assets.forEach((asset) =>
    inBox.add_token(
      TokenId.from_str(asset.tokenId),
      TokenAmount.from_i64(I64.from_str(asset.amount.toString()))
    )
  );
  return inBox.build();
};

export const mockPartialSignedTransaction = () => {
  const firstSecretKeyString =
    '5bc1d17d0612e696a9138ab8e85ca2a02d0171440ec128a9ad557c28bd5ea046';
  const secondSecretKeyString =
    '168e8fee8ac6965832d6c1c17cdf60c1b582b09f293d8bd88231e32740e3b24f';
  const firstSecrets = new SecretKeys();
  const firstSecretKey = SecretKey.dlog_from_bytes(
    Buffer.from(firstSecretKeyString, 'hex')
  );
  firstSecrets.add(firstSecretKey);
  const firstWallet = Wallet.from_secrets(firstSecrets);

  const secondSecrets = new SecretKeys();
  const secondSecretKey = SecretKey.dlog_from_bytes(
    Buffer.from(secondSecretKeyString, 'hex')
  );
  secondSecrets.add(secondSecretKey);
  const secondWallet = Wallet.from_secrets(secondSecrets);

  // MultiSig address of two publicKeys
  const addressString =
    '3sSMhchmFojcrqmeJXWfdr4CvPU8hz5BqyNBh3FBSLVdzNJNWe4oEtkfLyfEz3jNYUjwyRvBtrXBjq3LsqusGwkjunzRYexxDbUou5myRDjabniLd';
  const address = Address.from_base58(addressString);

  const fakeInBox = new ErgoBox(
    BoxValue.from_i64(I64.from_str('2200000')),
    100000,
    Contract.new(address.to_ergo_tree()),
    TxId.from_str(TestUtils.generateRandomId()),
    0,
    new Tokens()
  );

  const inBoxes = new BoxSelection(
    new ErgoBoxes(fakeInBox),
    new ErgoBoxAssetsDataList()
  );
  const tx = TxBuilder.new(
    inBoxes,
    new ErgoBoxCandidates(
      mockErgoBoxCandidate(1100000n, [], Contract.new(address.to_ergo_tree()))
    ),
    100010,
    BoxValue.from_i64(I64.from_str('1100000')),
    address
  ).build();

  const firstCommitment = firstWallet.generate_commitments(
    mockedErgoStateContext,
    tx,
    new ErgoBoxes(fakeInBox),
    ErgoBoxes.empty()
  );
  const secondCommitment = secondWallet.generate_commitments(
    mockedErgoStateContext,
    tx,
    new ErgoBoxes(fakeInBox),
    ErgoBoxes.empty()
  );
  const hintsBag = TransactionHintsBag.empty();
  hintsBag.add_hints_for_input(0, secondCommitment.all_hints_for_input(0));
  hintsBag.add_hints_for_input(0, firstCommitment.all_hints_for_input(0));
  const fakeTx = firstWallet.sign_transaction_multi(
    mockedErgoStateContext,
    tx,
    new ErgoBoxes(fakeInBox),
    ErgoBoxes.empty(),
    hintsBag
  );

  return {
    transaction: fakeTx,
    inputBoxes: [fakeInBox],
    commitments: [firstCommitment, secondCommitment],
  };
};

const boxTx1 = [
  'c0b19f051008040004000e20bd663e2b457d4277143d42e0dae82149ee0f2989d40ed99f43564ec6f6c9dfff040204000e2065214ca53fbf09c0875d71f67f28a0471a4d6d4f66c38ae47b6a417e645f68fd04c0700e20a357b00556e9e93c68de1a49e2f9d7c4925da5c2766702ec49b1a50e58281713d805d601e4c6a7041ad602b17201d603b4a573007202d604c2b2a5730100d605cb7204d196830301937202b17203afdc0c1d7201017203d901063c0e63d801d6088c720602ed9383010e8c720601e4c67208041a93c27208720495937205730296830201938cb2db6308b2a47303007304000173059299a373068cc7a70196830201aea4d901066393cbc272067307937205e4c6a7060ebdc33b019410db5b39388c6b515160e7248346d7ec63d5457292326da12a26cc02efb5260a031a0a205cea78cd9e83ad6de5ae2b4a44494507dd74a8c13223621edfc553b902d5bf7e200e83836f818a16766ac7490c5eee7abdc9357e6bb955641ff8ac56412bf576d020307f6f54ca9bd07e1d979beb6d2a35a19ef03339cad45d3f7a3f9aba327799ea20e8d2e63d683f57b1dc19bd554a316954703b74b1ebf7459f8b9cb8316dc6e6ba20ba094ca44078a94c780eb7df8e0e8ddcefda1d819bc026250c327b5f044fc1002035f401c431c3adcd4675177be89cc05c70a45de782e93dc226c545e38e37b95c2097a2dabcd974d69a07c3a03e20d05a36d13b986ffca5670302997484dd87e247200ea77346ecd826701113ef3596670f85ec0d4a000d37a06a762ba14623f360f3207dc9b5fd90c4343d48baddc8a7df8b005dd25a2765dadcabd6bfdcc337bcc29220549f37b65bf1c38e24132eeebe9053e8c1e8798a622cd0b3eccda1944ce9aad11a0c4033633635316163333361306334323031323439396463653466333439333738386461313235383232316231366139393735396434333566323262323564303037046572676f0763617264616e6f3339655a50546d6e387a7035474a374b5a77546f38634575784e64657a576159336842624c655769643745415a65647a6239744467616464723171787778706166677161736e64646b38657436656e30766e3734617767346a306e326e66656b366536326179777667637765646b3573327339326478376d7375746b33337a736c393275683875686168683330356e7a3770656b6a737a356c333777080000000005119b800800000000000cf9e0080000000000061a8040613131343365383163356162343835613830376536663066373661663164643730636335333539623239653062313232396430656466653439306433336236372c6173736574317632356579656e667a7276366d653968773476637a6670726463747a7935656433783939703240623466323764316561353265656430613436346565343331346363353135313565663037333430323835316661336466623662336630306233376262666464320800000000000ee19f0e20fdd14a1fc1c52cdddd322f6cd2e9c6afa050691f0e48784570edd24d4dd2ca206c2b0b9eead23daed886eb62ececb9813a4c2bfcd4439beac4dc114055aeb30900',
  '98a4cebd9006100304000e20b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda0400d801d601b2db6501fe730000ea02d1aedb63087201d901024d0e938c720201730198b2e4c672010510730200ade4c67201041ad901020ecdee720289c43b04a1143e81c5ab485a807e6f0f76af1dd70cc5359b29e0b1229d0edfe490d33b67eaa7dde517c59e86ef9d0280de582d6266add18fca339a77dfb321268e83033fe47101dc4d9ba497ddf1d7714ed6449240d166b0e44c529b5bf06d210796473d3811b9aa0e15329599164c24ff9d97b2afe8f74f51c1745883a62db6cf47f5765bd695317a01e54bcaaaeaa4aab0b517d2f46a24adc7dee285afd1b101001d8adc39e04b557ebb284d3c9111505201690f2e559d4cb13cf7e3524247365f0c',
];
const dataBoxTx1 = [
  'e09143100504000400040004000402d802d601c2a7d602b2a5730000ea02d196830301937201c2b2a473010093c272027201938cb2db63087202730200018cb2db6308a77303000198b2e4c6a70510730400ade4c6a7041ad901030ecdee7203a4973b01b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda01021a0a2103c236922914cf80be4b642b3ea02f532ceb120a82b7bc5b75a8c2b7dc70810a272102b1d6b33c5ef442fa140d52352cab3e80780e98a44bcf6826604f100dbe2cbec8210217b8b16c47f83c6e96324f4d65434cd77aca1ab969878ba8293b87001c4f216f21024df46a0f95903d15cc8c4f390bb3d0f97dee85273591a88575206baf2d54812e2103aa26adb6a56132f52c0919a351b738beee0d2a240d6b5a82eff27a0f662f34592102d64bd38b103af945c5786dfbd63577779f49e7166e69f622dc5c243dcbbdbab921024f0556828a51b54a2b17bf9d4cc4c7fd9faa3226513193ae0aeaf9075bad4aca2102a8b0cc627e16301030b1a74fc33d49dd364a2b818d5d25e02b4d9e3bfc1f4aac2103380c129ffb41ccc52dd58a128082ac381bb449ef67d230255eea28425599852421023605f5625c0f1099c5966a58a9291d7a546d432faeb99d88a99fa6b745b1fd3110020e102d6baff61607166b03da7c68eec2d3ea4611ff88cbf36d964f648f64f8c2cfb800',
];
const tx1Bytes =
  '02dc4254979de51bca4d93374f7cbba74d54d01d001c650a902eddefa23570bb3d0000bb5902e9487b808783dc62e30b0c880036df12c02c2649a1628e795c2a45b107a0030fd3bc56d8914f7747cd1604ef21d6331e38b2992e773364109fa15246796169c1ebc7490e5febca061beb55603a2a9f3ed032f291f23f14c6df77a1d41776446c34448aca60c4925b53c9b774dfd44946a6c17e1f44a13473ecd74fbeae18b747d873bdfed69a4d6819a69ff12a93044d8dd45e4442ee63d4565e74ddf1d1945c566a4f6471182eb020cd342a60943ff4d2fba6e86d47c21a82edf3432b0a68dbe21258a8cc852b84aa452fd68e3ff411b4ff485f76a90256eeed8bbab2f97e1bd84482f422e552598ccab9fdfe87bbda21f945a06003c2505ec3f42ca60cd5cfdc9a2ce9b28393fc083b1efecb3849a8a9751b4e4c8593b570c9941071ec595808d7507570e57745807d990db7c387e4d089e60c47b205b1516e95b5fc3f2621828889da43f392fc6e3d02e873c58fb9819804b4649cf02a603b2159b0b8ab6613a7d9357acbbbfd9964c8d2a697cd9e645dfc3465113400d1ee29d6015941dfed1b78e37fe4947fa18a0a0edac671ee26902a45968b8b3f9825d230126775c2b9a08ffa4e1ff8473a37fa8a5eba71344d20d949f2ced45d8bf246fb3a0e9d00016eccf30dc9e6d40e20f8dddc3d66e7ee45c82216906a2bacf14be9da8a811309059410db5b39388c6b515160e7248346d7ec63d5457292326da12a26cc02efb526a1143e81c5ab485a807e6f0f76af1dd70cc5359b29e0b1229d0edfe490d33b6751c1745883a62db6cf47f5765bd695317a01e54bcaaaeaa4aab0b517d2f46a24c59e86ef9d0280de582d6266add18fca339a77dfb321268e83033fe47101dc4d4ed6449240d166b0e44c529b5bf06d210796473d3811b9aa0e15329599164c240ee0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a01205cea78cd9e83ad6de5ae2b4a44494507dd74a8c13223621edfc553b902d5bf7ee0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a01200e83836f818a16766ac7490c5eee7abdc9357e6bb955641ff8ac56412bf576d0e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a0120307f6f54ca9bd07e1d979beb6d2a35a19ef03339cad45d3f7a3f9aba327799eae0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a0120e8d2e63d683f57b1dc19bd554a316954703b74b1ebf7459f8b9cb8316dc6e6bae0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a0120ba094ca44078a94c780eb7df8e0e8ddcefda1d819bc026250c327b5f044fc100e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a012035f401c431c3adcd4675177be89cc05c70a45de782e93dc226c545e38e37b95ce0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a012097a2dabcd974d69a07c3a03e20d05a36d13b986ffca5670302997484dd87e247e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a01200ea77346ecd826701113ef3596670f85ec0d4a000d37a06a762ba14623f360f3e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a01207dc9b5fd90c4343d48baddc8a7df8b005dd25a2765dadcabd6bfdcc337bcc292e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c720902731173128cc43b010001011a0120549f37b65bf1c38e24132eeebe9053e8c1e8798a622cd0b3eccda1944ce9aad1e0a7120008cd02d0b75bc997751195d143671cc10e8a590f25b987f2b2dd0d99cc5f48c6966d3d8cc43b0201e0f3330208011a0120cace36b20ac43a8bdf1a4674084e66c60bade2a41d5c147c3f648b75b499a409e0a7120008cd03cc76f1074a4477cd378329c4e902ee6145add72e9c26c82b4f2255e768d488118cc43b010180b51800f8e6cec09006100304000e20b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda0400d801d601b2db6501fe730000ea02d1aedb63087201d901024d0e938c720201730198b2e4c672010510730200ade4c67201041ad901020ecdee72028cc43b04018aff90e517039ba497ddf1d77104ff9d97b2afe8f74f02a5c7dee285afd1b10100e091431005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a573048cc43b0000';

const promiseCallback = {
  resolved: 0,
  rejected: 0,
  reject: (reason: any) => {
    promiseCallback.rejected += 1;
  },
  resolve: (value: wasm.Transaction | PromiseLike<wasm.Transaction>) => {
    promiseCallback.resolved += 1;
  },
};

const invalidTx: TxQueued = {
  boxes: boxTx1.map((item) =>
    wasm.ErgoBox.sigma_parse_bytes(Buffer.from(item, 'hex'))
  ),
  commitmentSigns: [],
  commitments: [],
  createTime: 0,
  dataBoxes: dataBoxTx1.map((item) =>
    wasm.ErgoBox.sigma_parse_bytes(Buffer.from(item, 'hex'))
  ),
  reject: promiseCallback.reject,
  requiredSigner: 4,
  resolve: promiseCallback.resolve,
  secret: undefined,
  sign: {
    signed: ['1', '2', '3', '4', '5'],
    simulated: [],
    transaction: Buffer.from(tx1Bytes, 'hex'),
  },
  tx: undefined,
};

const boxTx2 = [
  'c0b19f051008040004000e20bd663e2b457d4277143d42e0dae82149ee0f2989d40ed99f43564ec6f6c9dfff040204000e2065214ca53fbf09c0875d71f67f28a0471a4d6d4f66c38ae47b6a417e645f68fd04c0700e20a357b00556e9e93c68de1a49e2f9d7c4925da5c2766702ec49b1a50e58281713d805d601e4c6a7041ad602b17201d603b4a573007202d604c2b2a5730100d605cb7204d196830301937202b17203afdc0c1d7201017203d901063c0e63d801d6088c720602ed9383010e8c720601e4c67208041a93c27208720495937205730296830201938cb2db6308b2a47303007304000173059299a373068cc7a70196830201aea4d901066393cbc272067307937205e4c6a7060ec89b3b019410db5b39388c6b515160e7248346d7ec63d5457292326da12a26cc02efb5260a031a0a207dc9b5fd90c4343d48baddc8a7df8b005dd25a2765dadcabd6bfdcc337bcc29220307f6f54ca9bd07e1d979beb6d2a35a19ef03339cad45d3f7a3f9aba327799ea20e8d2e63d683f57b1dc19bd554a316954703b74b1ebf7459f8b9cb8316dc6e6ba20549f37b65bf1c38e24132eeebe9053e8c1e8798a622cd0b3eccda1944ce9aad1205cea78cd9e83ad6de5ae2b4a44494507dd74a8c13223621edfc553b902d5bf7e2035f401c431c3adcd4675177be89cc05c70a45de782e93dc226c545e38e37b95c2097a2dabcd974d69a07c3a03e20d05a36d13b986ffca5670302997484dd87e247200e83836f818a16766ac7490c5eee7abdc9357e6bb955641ff8ac56412bf576d0200ea77346ecd826701113ef3596670f85ec0d4a000d37a06a762ba14623f360f320ba094ca44078a94c780eb7df8e0e8ddcefda1d819bc026250c327b5f044fc1001a0c4062336364663830343666366632323635653563656531623066326536333362626462343639643237353735396133633638363661333263383264343537633534046572676f0763617264616e6f33396777575a475a675a68476a70315a4b4e51357274784e454c616d7a367472713974696744734b52793731626f5771334671716761646472317178776b6339756877303277766b677739716b7277327477657363756332737335337435796165646c307a6379656e326130793772656476676a78307430616c35367139646b797a773039356568386a77376c75616e326b683338717077337867730800000000001e8480080000000000030d40080000000000061a8040613131343365383163356162343835613830376536663066373661663164643730636335333539623239653062313232396430656466653439306433336236372c6173736574317632356579656e667a7276366d653968773476637a6670726463747a7935656433783939703240326238623563373936643938323237393366643335366439333961353834633833616464313031376235613631373962613538636431653038383332353534660800000000000ecda90e20fdd14a1fc1c52cdddd322f6cd2e9c6afa050691f0e48784570edd24d4dd2ca204c3e8acbe889703b41251ee3fc4dbdc9335b7314a03bf7a6eed5d8349192371700',
  '80a8d6b907100304000e20b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda0400d801d601b2db6501fe730000ea02d1aedb63087201d901024d0e938c720201730198b2e4c672010510730200ade4c67201041ad901020ecdee72028e9b3b04a1143e81c5ab485a807e6f0f76af1dd70cc5359b29e0b1229d0edfe490d33b67c0843dc59e86ef9d0280de582d6266add18fca339a77dfb321268e83033fe47101dc4dc0843d4ed6449240d166b0e44c529b5bf06d210796473d3811b9aa0e15329599164c24e80751c1745883a62db6cf47f5765bd695317a01e54bcaaaeaa4aab0b517d2f46a24c0843d00861154831badf7a01147cab761c3146a1b6afa1ece1038e01890e59a389a6ec900',
];
const dataBoxTx2 = [
  'e09143100504000400040004000402d802d601c2a7d602b2a5730000ea02d196830301937201c2b2a473010093c272027201938cb2db63087202730200018cb2db6308a77303000198b2e4c6a70510730400ade4c6a7041ad901030ecdee7203a4973b01b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda01021a0a2103c236922914cf80be4b642b3ea02f532ceb120a82b7bc5b75a8c2b7dc70810a272102b1d6b33c5ef442fa140d52352cab3e80780e98a44bcf6826604f100dbe2cbec8210217b8b16c47f83c6e96324f4d65434cd77aca1ab969878ba8293b87001c4f216f21024df46a0f95903d15cc8c4f390bb3d0f97dee85273591a88575206baf2d54812e2103aa26adb6a56132f52c0919a351b738beee0d2a240d6b5a82eff27a0f662f34592102d64bd38b103af945c5786dfbd63577779f49e7166e69f622dc5c243dcbbdbab921024f0556828a51b54a2b17bf9d4cc4c7fd9faa3226513193ae0aeaf9075bad4aca2102a8b0cc627e16301030b1a74fc33d49dd364a2b818d5d25e02b4d9e3bfc1f4aac2103380c129ffb41ccc52dd58a128082ac381bb449ef67d230255eea28425599852421023605f5625c0f1099c5966a58a9291d7a546d432faeb99d88a99fa6b745b1fd3110020e102d6baff61607166b03da7c68eec2d3ea4611ff88cbf36d964f648f64f8c2cfb800',
];
const tx2Bytes =
  '020515f249d518e2d0c27e5e52e1c46fcdc24b6ec71379142d7c220a8ce138bef90000733c34fb3e120e18cd763fc5ff21af431dc8ce8b769d67b3c98bdf322a31a5a9a003366307bdf887a6ebfbf5984803f4a992c2d6ba606d96f8d038875b5fa08e05ee75b606ddc6cb311ff9027a754a53ed044ab5ddec63994716b474319d2228e1a37c42dea403972e34beb750234cf6ab2b92e944c5d1064f8d9a930a157461e54fca1e9544357b545140d11b8bdf17134a068ff058b4aad8198e294bdca907dce3dea7538faf9ec94dbd0f62e3faa9f52e8855092a668523058889595f81de8e29e6d2728bddb6a0eaf58d455424b574cbc63ebc28e3483b8a951c03a79fd83fe209b4e865c3ca64bb54735874c0ad05d7eb9fdcad2e04820c3f87ac0bc46123b27b5069d1b4fdca7bd9bd57962d53030a3d8b469ce6aeb6701e230b6a60f86f55cc5e2922b3f41efbec579a8887d33d0004fa5038f01d26d313e7118a1c3742b7e633ab58d0e08f37533394b657e4839df2d78826d3c34612b8205257ec006899f4c9c6f949373da29541636fdfefac4c53b99f710a7229e14aff45c915527b377485a88f489a0d329ce79c95d2693d2d9ae413691f9313013b1398452debed7431d2f002286b7fa1df30c6664d1628c267d7d0d6350a614c807a0474c5de1dec00016eccf30dc9e6d40e20f8dddc3d66e7ee45c82216906a2bacf14be9da8a811309059410db5b39388c6b515160e7248346d7ec63d5457292326da12a26cc02efb526a1143e81c5ab485a807e6f0f76af1dd70cc5359b29e0b1229d0edfe490d33b6751c1745883a62db6cf47f5765bd695317a01e54bcaaaeaa4aab0b517d2f46a24c59e86ef9d0280de582d6266add18fca339a77dfb321268e83033fe47101dc4d4ed6449240d166b0e44c529b5bf06d210796473d3811b9aa0e15329599164c240ee0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a01207dc9b5fd90c4343d48baddc8a7df8b005dd25a2765dadcabd6bfdcc337bcc292e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a0120307f6f54ca9bd07e1d979beb6d2a35a19ef03339cad45d3f7a3f9aba327799eae0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a0120e8d2e63d683f57b1dc19bd554a316954703b74b1ebf7459f8b9cb8316dc6e6bae0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a0120549f37b65bf1c38e24132eeebe9053e8c1e8798a622cd0b3eccda1944ce9aad1e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a01205cea78cd9e83ad6de5ae2b4a44494507dd74a8c13223621edfc553b902d5bf7ee0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a012035f401c431c3adcd4675177be89cc05c70a45de782e93dc226c545e38e37b95ce0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a012097a2dabcd974d69a07c3a03e20d05a36d13b986ffca5670302997484dd87e247e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a01200e83836f818a16766ac7490c5eee7abdc9357e6bb955641ff8ac56412bf576d0e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a01200ea77346ecd826701113ef3596670f85ec0d4a000d37a06a762ba14623f360f3e0a71210130400040004040400040204000e204b1e5bcfbd6763b9cea8411841213611258fabed16293af6aa8cd8200b7e12860404040004000400010104020400040004000e20c2eeb21a772554cc9733586df12f27d2f444f50e623c1f57cf89c09dc5097c5505020101d807d601b2a5730000d6028cb2db6308a773010001d603aeb5b4a57302b1a5d901036391b1db630872037303d9010363aedb63087203d901054d0e938c7205017202d604e4c6a7041ad605b2a5730400d606db63087205d607ae7206d901074d0e938c720701720295938cb2db63087201730500017306d196830301ef7203938cb2db6308b2a473070073080001b2720473090095720796830201938cb27206730a0001720293c27205c2a7730bd801d608c2a7d196830501ef720393c27201720893e4c67201041a7204938cb2db6308b2a4730c00730d0001b27204730e00957207d801d609b27206730f0096830701938c720901720293cbc272057310e6c67205051ae6c67205060e93e4c67205070ecb720893e4c67205041a7204938c72090273117312949d3b010001011a0120ba094ca44078a94c780eb7df8e0e8ddcefda1d819bc026250c327b5f044fc100e0a7120008cd02d0b75bc997751195d143671cc10e8a590f25b987f2b2dd0d99cc5f48c6966d3d949d3b0201c09a0c0202011a01207c8c086e600fac64afb0b439d09dcf87a15aa2f5765b9f4a844b7ee281df21c6e0a7120008cd03cc76f1074a4477cd378329c4e902ee6145add72e9c26c82b4f2255e768d48811949d3b010180b51800e0ead6bc07100304000e20b039e4445337697deaad703fc8d1fcb129c4577e8673394fa2403e54d484eeda0400d801d601b2db6501fe730000ea02d1aedb63087201d901024d0e938c720201730198b2e4c672010510730200ade4c67201041ad901020ecdee7202949d3b040180b51803c0843d04e80702be843d00e091431005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304949d3b0000';

const validTx: TxQueued = {
  boxes: boxTx2.map((item) =>
    wasm.ErgoBox.sigma_parse_bytes(Buffer.from(item, 'hex'))
  ),
  commitmentSigns: [],
  commitments: [],
  createTime: 0,
  dataBoxes: dataBoxTx2.map((item) =>
    wasm.ErgoBox.sigma_parse_bytes(Buffer.from(item, 'hex'))
  ),
  reject: promiseCallback.reject,
  requiredSigner: 4,
  resolve: promiseCallback.resolve,
  secret: undefined,
  sign: {
    signed: ['1', '2', '3', '4', '5'],
    simulated: [],
    transaction: Buffer.from(tx2Bytes, 'hex'),
  },
  tx: undefined,
};

export { invalidTx, validTx, promiseCallback };
