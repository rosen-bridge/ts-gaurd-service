import config from 'config';
import Configs, {
  getChainNetworkName,
  getConfigIntKeyOrDefault,
} from './Configs';
import { rosenConfig } from './RosenConfig';
import { ERGO_CHAIN, ErgoConfigs } from '@rosen-chains/ergo';
import ChainsConstants from '../chains/ChainsConstants';

// TODO: remove any variables that are only used in ErgoConfigs (#236)
class GuardsErgoConfigs {
  // service configs
  static chainNetworkName = getChainNetworkName('ergo.chainNetwork', [
    ChainsConstants.ergoNodeType,
    ChainsConstants.ergoExplorerType,
  ]);
  static explorer = {
    url: config.get<string>('ergo.explorer.url'),
    timeout: getConfigIntKeyOrDefault('ergo.explorer.timeout', 8), // seconds
  };
  static node = {
    url: config.get<string>('ergo.node.url'),
    timeout: getConfigIntKeyOrDefault('ergo.node.timeout', 8), // seconds
  };

  // value configs
  static minimumErg = BigInt(config.get<string>('ergo.minBoxValue'));
  static txFee = BigInt(config.get<string>('ergo.fee'));

  // reward configs
  static bridgeFeeRepoAddress: string = config.get<string>(
    'reward.bridgeFeeRepoAddress'
  );
  static networkFeeRepoAddress: string = config.get<string>(
    'reward.networkFeeRepoAddress'
  );
  static watchersSharePercent = BigInt(
    getConfigIntKeyOrDefault('reward.watchersSharePercent', 50)
  );
  static watchersRSNSharePercent = BigInt(
    getConfigIntKeyOrDefault('reward.watchersRSNSharePercent', 0)
  );

  // confirmation configs
  static observationConfirmation = getConfigIntKeyOrDefault(
    'ergo.confirmation.observation',
    20
  );
  static eventConfirmation = getConfigIntKeyOrDefault(
    'ergo.confirmation.event',
    20
  );
  static distributionConfirmation = getConfigIntKeyOrDefault(
    'ergo.confirmation.payment',
    20
  );

  // scanner configs
  static initialHeight = getConfigIntKeyOrDefault('ergo.initialHeight', 925000);
  static scannerInterval = getConfigIntKeyOrDefault(
    'ergo.scannerInterval',
    180
  );

  // the ergo-related contract, addresses and tokens in rosen bridge
  static ergoContractConfig = rosenConfig.contractReader(ERGO_CHAIN);
  static coldAddress: string = config.get<string>('ergo.coldStorageAddress');

  // Ergo rosen extractor required configs
  static extractorOptions = {
    lockAddress: this.ergoContractConfig.lockAddress,
    tokens: Configs.tokens(),
  };

  // ErgoChain required configs
  static chainConfigs: ErgoConfigs = {
    fee: this.txFee,
    observationTxConfirmation: getConfigIntKeyOrDefault(
      'ergo.confirmation.observation',
      20
    ),
    paymentTxConfirmation: getConfigIntKeyOrDefault(
      'ergo.confirmation.payment',
      20
    ),
    coldTxConfirmation: getConfigIntKeyOrDefault('ergo.confirmation.cold', 20),
    lockAddress: this.ergoContractConfig.lockAddress,
    coldStorageAddress: this.coldAddress,
    rwtId: this.ergoContractConfig.RWTId,
    minBoxValue: this.minimumErg,
    eventTxConfirmation: getConfigIntKeyOrDefault(
      'ergo.confirmation.event',
      20
    ),
  };
}

export default GuardsErgoConfigs;
