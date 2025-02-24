import fs from 'fs';
import config from 'config';
import { RosenTokens, TokenMap } from '@rosen-bridge/tokens';
import { ThresholdConfig } from '../coldStorage/types';
import { JsonBI } from '../network/NetworkModels';
import Utils from '../utils/Utils';
import { ConfigError } from '../utils/errors';
import { SUPPORTED_CHAINS } from '../utils/constants';
import { TransportOptions } from '@rosen-bridge/winston-logger';
import { cloneDeep } from 'lodash-es';
import { ECDSA } from '@rosen-bridge/encryption';

/**
 * reads a numerical config, set default value if it does not exits
 * @param key
 * @param defaultValue
 */
const getConfigIntKeyOrDefault = (key: string, defaultValue: number) => {
  if (config.has(key)) {
    const val: string = config.get(key);
    if (val !== undefined) {
      const valNum = parseInt(val);
      if (isNaN(valNum)) {
        throw Error(`Invalid value ${val} for ${key}`);
      }
      return valNum;
    }
  }
  return defaultValue;
};

/**
 * reads chain network config, throws error if it is not supported
 * @param key
 * @param supportedNetworks
 */
const getChainNetworkName = (key: string, supportedNetworks: string[]) => {
  const network: string = config.get(key);
  if (network && supportedNetworks.includes(network)) return network;
  throw Error(`chain network [${network}] is not supported.`);
};

/**
 * reads an optional config, returns default value if it does not exits
 * @param key
 * @param defaultValue
 */
const getOptionalConfig = <T>(key: string, defaultValue: T) => {
  if (config.has(key)) {
    return config.get<T>(key);
  }
  return defaultValue;
};

class Configs {
  // express config
  static apiPort = getConfigIntKeyOrDefault('api.port', 8080);
  static apiHost = getOptionalConfig<string>('api.host', 'localhost');

  static publicEventStatusBaseUrl = config.get<string>(
    'publicEventStatus.baseUrl'
  );

  private static getAllowedOrigins = () => {
    const allowedOrigins = config.get<Array<string>>('api.allowedOrigins');
    if (
      !Array.isArray(allowedOrigins) ||
      allowedOrigins.some((origin) => typeof origin !== 'string')
    ) {
      throw new Error('ImproperlyConfigured. Api allowed origins is invalid.');
    }
    if (allowedOrigins.find((origin) => origin === '*')) {
      console.warn(
        'An allowed origin header with value "*" will cause all origins to be able to request this service, which may cause security issues'
      );
    }
    return allowedOrigins;
  };
  static apiAllowedOrigins = Configs.getAllowedOrigins();

  static apiKeyHash = config.get<string>('api.apiKeyHash');

  static apiBodyLimit =
    getConfigIntKeyOrDefault('api.jsonBodyLimit', 50) * 1024 * 1024; // value in MB
  static apiMaxRequestsPerMinute = getConfigIntKeyOrDefault(
    'api.maxRequestsPerMinute',
    100_000
  );
  static isManualTxRequestActive = getOptionalConfig<boolean>(
    'api.isManualTxRequestActive',
    false
  );
  static isArbitraryOrderRequestActive = getOptionalConfig<boolean>(
    'api.isArbitraryOrderRequestActive',
    false
  );

  // config of API's route
  static MAX_LENGTH_CHANNEL_SIZE = 200;

  // tss configs
  static tssExecutionPath = config.get<string>('tss.path');
  static tssConfigPath = config.get<string>('tss.configPath');
  static tssUrl = config.get<string>('tss.url');
  static tssPort = config.get<string>('tss.port');
  static tssBaseCallBackUrl = `http://${this.apiHost}:${this.apiPort}/tss/sign`;
  static tssParallelSignCount = config.get<number>('tss.parallelSign');
  static tssKeys = {
    encryptor: new ECDSA(config.get<string>('tss.secret')),
    pubs: config.get<
      Array<{
        curvePub: string;
        curveShareId: string;
        edwardShareId: string;
      }>
    >('tss.pubs'),
  };

  // event synchronization
  static parallelSyncLimit = getConfigIntKeyOrDefault(
    'eventSync.parallelSyncLimit',
    3
  );
  static parallelRequestCount = getConfigIntKeyOrDefault(
    'eventSync.parallelRequestCount',
    3
  );
  static eventSyncTimeout = getConfigIntKeyOrDefault('eventSync.timeout', 3600);
  static eventSyncInterval = getConfigIntKeyOrDefault('eventSync.interval', 60);

  // event reprocess
  static eventReprocessCooldown = getConfigIntKeyOrDefault(
    'eventReprocessCooldown',
    43200
  );

  // guards configs
  static guardMnemonic = config.get<string>('guard.mnemonic');
  static guardSecret = Utils.convertMnemonicToSecretKey(this.guardMnemonic);
  static guardConfigUpdateInterval = getConfigIntKeyOrDefault(
    'guard.configUpdateInterval',
    180
  );

  // contract, addresses and tokens config
  static networksType = SUPPORTED_CHAINS.map((network) =>
    config.get<string>(`${network}.networkType`).toLowerCase()
  );
  static addressesBasePath = config.get<string>('contracts.addressesBasePath');
  private static tokensConfig: RosenTokens;
  static tokensVersion: string;
  static tokens = (): RosenTokens => {
    if (!this.tokensConfig) {
      const tokensPath = config.get<string>('tokensPath');
      if (!fs.existsSync(tokensPath)) {
        throw new Error(
          `Tokens config file with path ${tokensPath} doesn't exist`
        );
      } else {
        const configJson: string = fs.readFileSync(tokensPath, 'utf8');
        const tokensConfig = JSON.parse(configJson);
        this.tokensConfig = tokensConfig;
        this.tokensVersion = tokensConfig.version;
      }
    }
    return this.tokensConfig;
  };
  static tokenMap = new TokenMap(this.tokens());
  static thresholds = (): ThresholdConfig => {
    const thresholdsPath = config.get<string>('thresholdsPath');
    let thresholds: ThresholdConfig;
    if (!fs.existsSync(thresholdsPath)) {
      throw new Error(
        `Asset thresholds config file with path ${thresholdsPath} doesn't exist`
      );
    } else {
      const configJson: string = fs.readFileSync(thresholdsPath, 'utf8');
      thresholds = JsonBI.parse(configJson);
    }
    // wrap values
    for (const chain of Object.keys(thresholds)) {
      const tokenIds = Object.keys(thresholds[chain].tokens);
      tokenIds.forEach((tokenId) => {
        thresholds[chain].tokens[tokenId].high = this.tokenMap.wrapAmount(
          tokenId,
          thresholds[chain].tokens[tokenId].high,
          chain
        ).amount;
        thresholds[chain].tokens[tokenId].low = this.tokenMap.wrapAmount(
          tokenId,
          thresholds[chain].tokens[tokenId].low,
          chain
        ).amount;
      });
    }

    return thresholds;
  };

  // timeout configs
  static eventTimeout = getConfigIntKeyOrDefault('eventTimeout', 24 * 60 * 60); // seconds
  static orderTimeout = getConfigIntKeyOrDefault('orderTimeout', 48 * 60 * 60); // seconds
  static txSignTimeout = getConfigIntKeyOrDefault('txSignTimeout', 5 * 60); // seconds

  // jobs configs
  static scannedEventProcessorInterval = 120; // seconds, 2 minutes
  static txProcessorInterval = getConfigIntKeyOrDefault(
    'intervals.txProcessorInterval',
    180
  ); // seconds
  static agreementQueueInterval = 5; // seconds
  static txResendInterval = 25; // seconds
  static approvalResendDelay = 5; // seconds
  static multiSigCleanUpInterval = 120; // seconds
  static tssInstanceRestartGap = 5; // seconds
  static tssUpdateInterval = 10; // seconds
  static detectionUpdateInterval = 10; // seconds
  static timeoutProcessorInterval = getConfigIntKeyOrDefault(
    'intervals.timeoutProcessorInterval',
    3600
  ); // seconds
  static requeueWaitingEventsInterval = getConfigIntKeyOrDefault(
    'intervals.requeueWaitingEventsInterval',
    43200
  ); // seconds
  static minimumFeeUpdateInterval = getConfigIntKeyOrDefault(
    'intervals.minimumFeeUpdateInterval',
    300
  ); // seconds

  static multiSigFirstSignDelay = 3; // seconds

  // logs configs
  static logs;
  static {
    const logs = config.get<TransportOptions[]>('logs');
    const clonedLogs = cloneDeep(logs);
    const wrongLogTypeIndex = clonedLogs.findIndex((log) => {
      const logTypeValidation = ['console', 'file', 'loki'].includes(log.type);
      let loggerChecks = true;
      if (log.type === 'loki') {
        const overrideLokiBasicAuth = getOptionalConfig(
          'overrideLokiBasicAuth',
          ''
        );
        if (overrideLokiBasicAuth !== '') log.basicAuth = overrideLokiBasicAuth;
        loggerChecks =
          log.host != undefined &&
          typeof log.host === 'string' &&
          log.level != undefined &&
          typeof log.level === 'string' &&
          (log.serviceName ? typeof log.serviceName === 'string' : true) &&
          (log.basicAuth ? typeof log.basicAuth === 'string' : true);
      } else if (log.type === 'file') {
        loggerChecks =
          log.path != undefined &&
          typeof log.path === 'string' &&
          log.level != undefined &&
          typeof log.level === 'string' &&
          log.maxSize != undefined &&
          typeof log.maxSize === 'string' &&
          log.maxFiles != undefined &&
          typeof log.maxFiles === 'string';
      }
      return !(loggerChecks && logTypeValidation);
    });
    if (wrongLogTypeIndex >= 0) {
      throw new ConfigError(
        `logs[${wrongLogTypeIndex}]`,
        logs[wrongLogTypeIndex]
      );
    }
    this.logs = clonedLogs;
  }

  // Database Configs
  static dbType = getOptionalConfig('database.type', '');
  static dbPath = getOptionalConfig('database.path', '');
  static dbHost = getOptionalConfig('database.host', '');
  static dbPort = getOptionalConfig('database.port', 5432);
  static dbUser = getOptionalConfig('database.user', '');
  static dbPassword = getOptionalConfig('database.password', '');
  static dbName = getOptionalConfig('database.name', '');

  // HealthCheck Configs
  static healthUpdateInterval = getConfigIntKeyOrDefault(
    'healthCheck.interval',
    60
  );
  static healthCheckTimeout = getConfigIntKeyOrDefault(
    'healthCheck.timeout',
    20
  );
  static ergWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.erg.warnThreshold')
  );
  static ergCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.erg.criticalThreshold')
  );
  static emissionTokenWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.emissionToken.warnThreshold')
  );
  static emissionTokenCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.emissionToken.criticalThreshold')
  );
  static adaWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.ada.warnThreshold')
  );
  static adaCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.ada.criticalThreshold')
  );
  static btcWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.btc.warnThreshold')
  );
  static btcCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.btc.criticalThreshold')
  );
  static ethWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.eth.warnThreshold')
  );
  static ethCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.eth.criticalThreshold')
  );
  static bnbWarnThreshold = BigInt(
    config.get<string>('healthCheck.asset.bnb.warnThreshold')
  );
  static bnbCriticalThreshold = BigInt(
    config.get<string>('healthCheck.asset.bnb.criticalThreshold')
  );
  static ergoScannerWarnDiff = getConfigIntKeyOrDefault(
    'healthCheck.ergoScanner.warnDifference',
    5
  );
  static ergoScannerCriticalDiff = getConfigIntKeyOrDefault(
    'healthCheck.ergoScanner.criticalDifference',
    20
  );
  static ethereumScannerWarnDiff = getConfigIntKeyOrDefault(
    'healthCheck.ethereumScanner.warnDifference',
    50
  );
  static ethereumScannerCriticalDiff = getConfigIntKeyOrDefault(
    'healthCheck.ethereumScanner.criticalDifference',
    200
  );
  static binanceScannerWarnDiff = getConfigIntKeyOrDefault(
    'healthCheck.binanceScanner.warnDifference',
    200
  );
  static binanceScannerCriticalDiff = getConfigIntKeyOrDefault(
    'healthCheck.binanceScanner.criticalDifference',
    800
  );
  static ergoNodeMaxHeightDiff = getConfigIntKeyOrDefault(
    'healthCheck.ergoNode.maxHeightDifference',
    2
  );
  static ergoNodeMaxBlockTime =
    getConfigIntKeyOrDefault('healthCheck.ergoNode.maxBlockTime', 1800) / 60;
  static ergoNodeMinPeerCount = getConfigIntKeyOrDefault(
    'healthCheck.ergoNode.minPeerCount',
    10
  );
  static ergoNodeMaxPeerHeightDifference = getConfigIntKeyOrDefault(
    'healthCheck.ergoNode.maxPeerHeightDifference',
    2
  );
  static logDuration =
    getConfigIntKeyOrDefault('healthCheck.logs.duration', 600) * 1000;
  static errorLogAllowedCount = getConfigIntKeyOrDefault(
    'healthCheck.logs.maxAllowedErrorCount',
    1
  );
  static warnLogAllowedCount = getConfigIntKeyOrDefault(
    'healthCheck.logs.maxAllowedWarnCount',
    10
  );
  static p2pDefectConfirmationTimeWindow = getConfigIntKeyOrDefault(
    'healthCheck.p2p.defectConfirmationTimeWindow',
    120
  );
  static p2pBrokenTimeAllowed =
    getConfigIntKeyOrDefault('p2p.brokenTimeAllowed', 1200) * 1000;
  static txSignFailedWarnThreshold = getConfigIntKeyOrDefault(
    'healthCheck.txSignFailed.warnThreshold',
    3
  );
  static txSignFailedCriticalThreshold = getConfigIntKeyOrDefault(
    'healthCheck.txSignFailed.criticalThreshold',
    7
  );
  static eventDurationWarnThreshold = getConfigIntKeyOrDefault(
    'healthCheck.eventDuration.warnThreshold',
    7200 // 2 hours
  );
  static eventDurationCriticalThreshold = getConfigIntKeyOrDefault(
    'healthCheck.eventDuration.criticalThreshold',
    18000 // 5 hours
  );

  // Revenue Config
  static revenueUpdateInterval = getConfigIntKeyOrDefault(
    'revenue.interval',
    120
  );

  // Notification Configs
  static discordWebHookUrl = config.get<string>('discordWebHookUrl');
  static historyCleanupThreshold = config.get<number>(
    'notification.historyCleanupThreshold'
  );
  static hasBeenUnstableForAWhileWindowDuration = config.get<number>(
    'notification.windowDurations.hasBeenUnstableForAWhile'
  );
  static hasBeenUnknownForAWhileWindowDuration = config.get<number>(
    'notification.windowDurations.hasBeenUnknownForAWhile'
  );
  static isStillUnhealthyWindowDuration = config.get<number>(
    'notification.windowDurations.isStillUnhealthy'
  );
}

export default Configs;
export { getConfigIntKeyOrDefault, getChainNetworkName };
