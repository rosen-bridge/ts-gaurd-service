import { AbstractChain } from '@rosen-chains/abstract-chain';
import {
  AbstractCardanoNetwork,
  CARDANO_CHAIN,
  CardanoChain,
} from '@rosen-chains/cardano';
import {
  AbstractBitcoinNetwork,
  BITCOIN_CHAIN,
  BitcoinChain,
} from '@rosen-chains/bitcoin';
import {
  AbstractDogeNetwork,
  DOGE_CHAIN,
  DogeChain,
} from '@rosen-chains/doge';
import { AbstractErgoNetwork, ERGO_CHAIN, ErgoChain } from '@rosen-chains/ergo';
import CardanoKoiosNetwork, {
  KOIOS_NETWORK,
} from '@rosen-chains/cardano-koios-network';
import ErgoNodeNetwork, { NODE_NETWORK } from '@rosen-chains/ergo-node-network';
import ErgoExplorerNetwork, {
  EXPLORER_NETWORK,
} from '@rosen-chains/ergo-explorer-network';
import Configs from '../configs/Configs';
import GuardsCardanoConfigs from '../configs/GuardsCardanoConfigs';
import GuardsErgoConfigs from '../configs/GuardsErgoConfigs';
import MultiSigHandler from '../guard/multisig/MultiSigHandler';
import Tss from '../guard/Tss';
import WinstonLogger from '@rosen-bridge/winston-logger';
import { BLOCKFROST_NETWORK } from '@rosen-chains/cardano-blockfrost-network';
import CardanoBlockFrostNetwork from '@rosen-chains/cardano-blockfrost-network/dist/CardanoBlockFrostNetwork';
import BitcoinEsploraNetwork from '@rosen-chains/bitcoin-esplora';
import GuardsBitcoinConfigs from '../configs/GuardsBitcoinConfigs';
import DogeEsploraNetwork from '@rosen-chains/doge-esplora';
import GuardsDogeConfigs from '../configs/GuardsDogeConfigs';
import EthereumChain from '@rosen-chains/ethereum/dist/EthereumChain';
import { AbstractEvmNetwork } from '@rosen-chains/evm';
import GuardsEthereumConfigs from '../configs/GuardsEthereumConfigs';
import EvmRpcNetwork from '@rosen-chains/evm-rpc';
import { dataSource } from '../db/dataSource';
import { ETHEREUM_CHAIN } from '@rosen-chains/ethereum';

const logger = WinstonLogger.getInstance().getLogger(import.meta.url);

class ChainHandler {
  private static instance: ChainHandler;
  private readonly ergoChain: ErgoChain;
  private readonly cardanoChain: CardanoChain;
  private readonly bitcoinChain: BitcoinChain;
  private readonly dogeChain: DogeChain;
  private readonly ethereumChain: EthereumChain;

  private constructor() {
    this.ergoChain = this.generateErgoChain();
    this.cardanoChain = this.generateCardanoChain();
    this.bitcoinChain = this.generateBitcoinChain();
    this.dogeChain = this.generateDogeChain();
    this.ethereumChain = this.generateEthereumChain();
    logger.info('ChainHandler instantiated');
  }

  /**
   * generates a ChainHandler object if it doesn't exist
   * @returns ChainHandler instance
   */
  public static getInstance = () => {
    if (!ChainHandler.instance) {
      logger.debug("ChainHandler instance didn't exist. Creating a new one");
      ChainHandler.instance = new ChainHandler();
    }
    return ChainHandler.instance;
  };

  /**
   * generates Ergo network and chain objects using configs
   * @returns ErgoChain object
   */
  private generateErgoChain = (): ErgoChain => {
    let network: AbstractErgoNetwork;
    switch (GuardsErgoConfigs.chainNetworkName) {
      case NODE_NETWORK:
        network = new ErgoNodeNetwork({
          nodeBaseUrl: GuardsErgoConfigs.node.url,
          logger: WinstonLogger.getInstance().getLogger('NodeNetwork'),
        });
        break;
      case EXPLORER_NETWORK:
        network = new ErgoExplorerNetwork({
          explorerBaseUrl: GuardsErgoConfigs.explorer.url,
          logger: WinstonLogger.getInstance().getLogger('ExplorerNetwork'),
        });
        break;
      default:
        throw Error(
          `No case is defined for network [${GuardsErgoConfigs.chainNetworkName}]`
        );
    }
    const multiSigSignFunction = MultiSigHandler.getInstance().sign;
    return new ErgoChain(
      network,
      GuardsErgoConfigs.chainConfigs,
      Configs.tokens(),
      multiSigSignFunction,
      WinstonLogger.getInstance().getLogger('ErgoChain')
    );
  };

  /**
   * generates Cardano network and chain objects using configs
   * @returns CardanoChain object
   */
  private generateCardanoChain = (): CardanoChain => {
    let network: AbstractCardanoNetwork;
    switch (GuardsCardanoConfigs.chainNetworkName) {
      case KOIOS_NETWORK:
        network = new CardanoKoiosNetwork(
          GuardsCardanoConfigs.koios.url,
          GuardsCardanoConfigs.koios.authToken,
          WinstonLogger.getInstance().getLogger('KoiosNetwork')
        );
        break;
      case BLOCKFROST_NETWORK:
        network = new CardanoBlockFrostNetwork(
          GuardsCardanoConfigs.blockfrost.projectId,
          GuardsCardanoConfigs.blockfrost.url,
          WinstonLogger.getInstance().getLogger('BlockFrostNetwork')
        );
        break;
      default:
        throw Error(
          `No case is defined for network [${GuardsCardanoConfigs.chainNetworkName}]`
        );
    }
    const chainCode = GuardsCardanoConfigs.tssChainCode;
    const edwardSign = Tss.getInstance().edwardSign;
    const tssSignFunctionWrapper = async (
      txHash: Uint8Array
    ): Promise<string> => {
      const res = await edwardSign(
        Buffer.from(txHash).toString('hex'),
        chainCode
      );
      return res.signature;
    };
    return new CardanoChain(
      network,
      GuardsCardanoConfigs.chainConfigs,
      Configs.tokens(),
      tssSignFunctionWrapper,
      WinstonLogger.getInstance().getLogger('CardanoChain')
    );
  };

  /**
   * generates Bitcoin network and chain objects using configs
   * @returns BitcoinChain object
   */
  private generateBitcoinChain = (): BitcoinChain => {
    let network: AbstractBitcoinNetwork;
    switch (GuardsBitcoinConfigs.chainNetworkName) {
      case 'esplora':
        network = new BitcoinEsploraNetwork(
          GuardsBitcoinConfigs.esplora.url,
          WinstonLogger.getInstance().getLogger('EsploraNetwork')
        );
        break;
      default:
        throw Error(
          `No case is defined for network [${GuardsBitcoinConfigs.chainNetworkName}]`
        );
    }
    const chainCode = GuardsBitcoinConfigs.tssChainCode;
    const derivationPath = GuardsBitcoinConfigs.derivationPath;
    const curveSign = Tss.getInstance().curveSign;
    const tssSignFunctionWrapper = async (
      txHash: Uint8Array
    ): Promise<{
      signature: string;
      signatureRecovery: string;
    }> => {
      const res = await curveSign(
        Buffer.from(txHash).toString('hex'),
        chainCode,
        derivationPath
      );
      return {
        signature: res.signature,
        signatureRecovery: res.signatureRecovery!,
      };
    };
    return new BitcoinChain(
      network,
      GuardsBitcoinConfigs.chainConfigs,
      Configs.tokens(),
      tssSignFunctionWrapper,
      WinstonLogger.getInstance().getLogger('BitcoinChain')
    );
  };

  /**
   * generates Doge network and chain objects using configs
   * @returns DogeChain object
   */
  private generateDogeChain = (): DogeChain => {
    let network: AbstractDogeNetwork;
    switch (GuardsDogeConfigs.chainNetworkName) {
      case 'esplora':
        network = new DogeEsploraNetwork(
          GuardsDogeConfigs.esplora.url,
          WinstonLogger.getInstance().getLogger('EsploraNetwork')
        );
        break;
      default:
        throw Error(
          `No case is defined for network [${GuardsDogeConfigs.chainNetworkName}]`
        );
    }
    const chainCode = GuardsDogeConfigs.tssChainCode;
    const derivationPath = GuardsDogeConfigs.derivationPath;
    const curveSign = Tss.getInstance().curveSign;
    const tssSignFunctionWrapper = async (
      txHash: Uint8Array
    ): Promise<{
      signature: string;
      signatureRecovery: string;
    }> => {
      const res = await curveSign(
        Buffer.from(txHash).toString('hex'),
        chainCode,
        derivationPath
      );
      return {
        signature: res.signature,
        signatureRecovery: res.signatureRecovery!,
      };
    };
    return new DogeChain(
      network,
      GuardsDogeConfigs.chainConfigs,
      Configs.tokens(),
      tssSignFunctionWrapper,
      WinstonLogger.getInstance().getLogger('DogeChain')
    );
  };

  /**
   * generates Ethereum network and chain objects using configs
   * @returns EthereumChain object
   */
  private generateEthereumChain = (): EthereumChain => {
    let network: AbstractEvmNetwork;
    switch (GuardsEthereumConfigs.chainNetworkName) {
      case 'rpc':
        network = new EvmRpcNetwork(
          ETHEREUM_CHAIN,
          GuardsEthereumConfigs.rpc.url,
          dataSource,
          GuardsEthereumConfigs.ethereumContractConfig.lockAddress,
          GuardsEthereumConfigs.rpc.authToken,
          WinstonLogger.getInstance().getLogger('EthereumRpcNetwork')
        );
        break;
      default:
        throw Error(
          `No case is defined for network [${GuardsEthereumConfigs.chainNetworkName}]`
        );
    }
    const chainCode = GuardsEthereumConfigs.tssChainCode;
    const derivationPath = GuardsEthereumConfigs.derivationPath;
    const curveSign = Tss.getInstance().curveSign;
    const tssSignFunctionWrapper = async (
      txHash: Uint8Array
    ): Promise<{
      signature: string;
      signatureRecovery: string;
    }> => {
      const res = await curveSign(
        Buffer.from(txHash).toString('hex'),
        chainCode,
        derivationPath
      );
      return {
        signature: res.signature,
        signatureRecovery: res.signatureRecovery!,
      };
    };
    // get all supported tokens on Ethereum
    const supportedTokens = Configs.tokens()
      .tokens.filter(
        (tokenSet) =>
          Object.keys(tokenSet).includes(ETHEREUM_CHAIN) &&
          tokenSet[ETHEREUM_CHAIN].metaData.type !== 'native'
      )
      .map(
        (tokenSet) =>
          tokenSet[ETHEREUM_CHAIN][Configs.tokenMap.getIdKey(ETHEREUM_CHAIN)]
      );
    return new EthereumChain(
      network,
      GuardsEthereumConfigs.chainConfigs,
      Configs.tokens(),
      supportedTokens,
      tssSignFunctionWrapper,
      WinstonLogger.getInstance().getLogger('EthereumChain')
    );
  };

  /**
   * gets chain object by name
   * @param chain chain name
   * @returns chain object
   */
  getChain = (chain: string): AbstractChain<any> => {
    switch (chain) {
      case ERGO_CHAIN:
        return this.ergoChain;
      case CARDANO_CHAIN:
        return this.cardanoChain;
      case BITCOIN_CHAIN:
        return this.bitcoinChain;
      case DOGE_CHAIN:
        return this.dogeChain;
      case ETHEREUM_CHAIN:
        return this.ethereumChain;
      default:
        throw Error(`Chain [${chain}] is not implemented`);
    }
  };

  /**
   * gets ergo chain object
   * @returns chain object
   */
  getErgoChain = (): ErgoChain => {
    return this.ergoChain;
  };
}

export default ChainHandler;
