import './bootstrap';
import { initDataSources } from './jobs/dataSources';
import { initializeMultiSigJobs } from './jobs/multiSig';
import { initApiServer } from './jobs/apiServer';
import { runProcessors } from './jobs/runProcessors';
import Configs from './configs/Configs';
import { initScanner } from './jobs/initScanner';
import { healthCheckStart } from './jobs/healthCheck';
import ChainHandler from './handlers/ChainHandler';
import TxAgreement from './agreement/TxAgreement';
import MultiSigHandler from './guard/multisig/MultiSigHandler';
import { configUpdateJob } from './jobs/guardConfigUpdate';
import MultiSigUtils from './guard/multisig/MultiSigUtils';
import { DatabaseAction } from './db/DatabaseAction';
import { dataSource } from './db/dataSource';
import { tssUpdateJob } from './jobs/tss';
import { revenueJob } from './jobs/revenue';
import GuardPkHandler from './handlers/GuardPkHandler';
import MinimumFeeHandler from './handlers/MinimumFeeHandler';
import { minimumFeeUpdateJob } from './jobs/minimumFee';
import { NotificationHandler } from './handlers/NotificationHandler';
import Dialer from './communication/Dialer';
import EventSynchronization from './synchronization/EventSynchronization';
import DetectionHandler from './handlers/DetectionHandler';
import EventReprocess from './reprocess/EventReprocess';
import ArbitraryProcessor from './arbitrary/ArbitraryProcessor';
import TssHandler from './handlers/TssHandler';
import PublicStatusHandler from './handlers/PublicStatusHandler';

const init = async () => {
  // initialize NotificationHandler object
  NotificationHandler.setup();

  // initialize all data sources
  await initDataSources();

  // initialize DatabaseAction
  DatabaseAction.init(dataSource);

  // initialize PublicStatusHandler
  PublicStatusHandler.init(dataSource);

  // initialize express Apis
  await initApiServer();

  // initialize Dialer and DetectionHandler
  await Dialer.getInstance();
  await DetectionHandler.init();

  // initialize tss multiSig object
  await MultiSigHandler.init(Configs.guardSecret);
  initializeMultiSigJobs();

  // start tss instance
  await TssHandler.init();
  tssUpdateJob();

  // initialize chain objects
  const chainHandler = ChainHandler.getInstance();
  MultiSigUtils.getInstance().init(chainHandler.getErgoChain().getStateContext);

  // guard config update job
  const pkHandler = GuardPkHandler.getInstance();
  await pkHandler.update();
  pkHandler.updateDependentModules();
  setTimeout(configUpdateJob, Configs.guardConfigUpdateInterval * 1000);

  // initialize TxAgreement object
  await TxAgreement.getInstance();

  // initialize ArbitraryProcessor object
  ArbitraryProcessor.getInstance();

  // initialize EventSynchronization object
  await EventSynchronization.init();

  // initialize EventReprocess object
  await EventReprocess.init();

  // initialize MinimumFeeHandler
  await MinimumFeeHandler.init(Configs.tokens());
  minimumFeeUpdateJob();

  // run network scanners
  initScanner();

  // run processors
  runProcessors();

  // initialize guard health check
  await healthCheckStart();

  // run revenue job
  await revenueJob();
};

init().then(() => null);
