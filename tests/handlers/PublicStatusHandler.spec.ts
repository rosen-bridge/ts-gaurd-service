/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DataSource } from 'typeorm';
import { TransactionType } from '@rosen-chains/abstract-chain';
import { Mock } from 'vitest';

import PublicStatusHandler, {
  logger,
  UpdateStatusDTO,
} from '../../src/handlers/PublicStatusHandler';
import Configs from '../../src/configs/Configs';
import { EventStatus } from '../../src/utils/constants';

const id = '0000000000000000000000000000000000000000000000000000000000000000';

describe('PublicStatusHandler', () => {
  let mockDataSource: Partial<DataSource>;
  let mockRepository: any;

  beforeEach(() => {
    // Clear any previous instance
    // @ts-ignore: allowing access for tests
    PublicStatusHandler['instance'] = undefined;

    // Reset all mocks
    vi.restoreAllMocks();

    // Create a stub for the repository
    mockRepository = {
      findOne: vi.fn(),
    };

    // Create a stub for DataSource
    mockDataSource = {
      getRepository: vi.fn(() => mockRepository),
    };
  });

  describe('init', () => {
    /**
     * @target PublicStatusHandler.init should initialize the PublicStatusHandler instance with a valid dataSource
     * @dependencies
     * @scenario
     * - create a mock for dataSource that returns a valid repository when getRepository is called
     * - call PublicStatusHandler.init with the stubbed dataSource
     * @expected
     * - instance should have been created
     * - instance.axios should have been configured with the Configs.publicEventStatusBaseUrl
     * - instance.txRepository should have been set to the repository returned by dataSource.getRepository
     */
    it('should initialize the PublicStatusHandler instance with a valid dataSource', async () => {
      // Act
      await PublicStatusHandler.init(mockDataSource as DataSource);

      // Assert
      const instance = PublicStatusHandler.getInstance();
      expect(instance).toBeDefined();
      expect(instance.axios.defaults.baseURL).toEqual(
        Configs.publicEventStatusBaseUrl
      );
      expect(mockDataSource.getRepository).toHaveBeenCalled();
      expect(instance.txRepository).toEqual(mockRepository);
    });
  });

  describe('getInstance', () => {
    /**
     * @target PublicStatusHandler.getInstance should throw an error when getInstance is called before init
     * @dependencies
     * @scenario
     * - ensure PublicStatusHandler.instance is undefined
     * - call PublicStatusHandler.getInstance
     * @expected
     * - an error should have been thrown with correct error message
     */
    it('should throw an error when getInstance is called before init', () => {
      // @ts-ignore: accessing private property for testing purpose
      PublicStatusHandler['instance'] = undefined;
      expect(() => PublicStatusHandler.getInstance()).toThrowError(
        'PublicStatusHandler should have been initialized before getInstance'
      );
    });

    /**
     * @target PublicStatusHandler.getInstance should return the existing instance when getInstance is called after init
     * @dependencies
     * @scenario
     * - initialize PublicStatusHandler using PublicStatusHandler.init with a valid stubbed dataSource
     * - call PublicStatusHandler.getInstance
     * @expected
     * - the returned instance should have matched object PublicStatusHandler.instance
     */
    it('should return the existing instance when getInstance is called after init', async () => {
      await PublicStatusHandler.init(mockDataSource as DataSource);
      const instance = PublicStatusHandler.getInstance();
      // @ts-ignore: accessing private property for testing purpose
      expect(instance).toEqual(PublicStatusHandler['instance']);
    });
  });

  describe('submitRequest', () => {
    let instance: PublicStatusHandler;
    const validDto: UpdateStatusDTO = {
      date: Date.now(),
      eventId: id,
      status: 'inPayment',
      txId: undefined,
      txType: undefined,
      txStatus: undefined,
    };

    beforeEach(async () => {
      await PublicStatusHandler.init(mockDataSource as DataSource);
      instance = PublicStatusHandler.getInstance();
    });

    /**
     * @target PublicStatusHandler.submitRequest should call axios.post with the correct payload when submitRequest is called
     * @dependencies
     * @scenario
     * - create a valid UpdateStatusDTO object
     * - stub encryptor.getPk to resolve to a specific public key
     * - stub encryptor.sign to resolve to a specific signature
     * - spy on axios.post method
     * - call submitRequest with the provided DTO
     * @expected
     * - instance.dtoToSignMessageSpy should have been called with the dto
     * - encryptor.sign should have been called with signMessage
     * - axios.post should have been called with '/status' and a body containing:
     *   - the original DTO properties
     *   - pk equal to the stubbed public key
     *   - signature equal to the stubbed signature
     */
    it('should call axios.post with the correct payload when submitRequest is called', async () => {
      // Arrange
      const stubbedPk = 'stubbed-pk';
      const stubbedSignature = 'stubbed-signature';
      vi.spyOn(Configs.tssKeys.encryptor, 'getPk').mockResolvedValue(stubbedPk);
      const signSpy = vi
        .spyOn(Configs.tssKeys.encryptor, 'sign')
        .mockResolvedValue(stubbedSignature);
      const axiosPostSpy = vi
        .spyOn(instance.axios, 'post')
        .mockResolvedValue({ data: {} });
      const signMessage = 'test-sign-message';
      const dtoToSignMessageSpy = vi
        .spyOn(instance, 'dtoToSignMessage')
        .mockReturnValue(signMessage);

      // Act
      await instance.submitRequest(validDto);

      // Assert
      expect(dtoToSignMessageSpy).toHaveBeenCalledWith(validDto);
      expect(signSpy).toHaveBeenCalledWith(signMessage);
      expect(axiosPostSpy).toHaveBeenCalledWith('/status', {
        body: {
          ...validDto,
          pk: stubbedPk,
          signature: stubbedSignature,
        },
      });
    });

    /**
     * @target PublicStatusHandler.submitRequest should log an error when axios.post fails
     * @dependencies
     * @scenario
     * - create a valid UpdateStatusDTO object
     * - stub encryptor.getPk to resolve to a specific public key
     * - stub encryptor.sign to resolve to a specific signature
     * - stub axios.post to reject with an error
     * - spy on logger.error
     * - call submitRequest with the provided DTO
     * @expected
     * - logger.error should have been called with the error thrown by axios.post
     */
    it('should log an error when axios.post fails', async () => {
      // Arrange
      const stubError = new Error('network error');
      vi.spyOn(Configs.tssKeys.encryptor, 'getPk').mockResolvedValue(
        'stubbed-pk'
      );
      vi.spyOn(Configs.tssKeys.encryptor, 'sign').mockResolvedValue(
        'stubbed-signature'
      );
      vi.spyOn(instance.axios, 'post').mockRejectedValue(stubError);
      const loggerErrorSpy = vi
        .spyOn(logger, 'error')
        .mockImplementation(() => {
          //
        });

      // Act
      await instance.submitRequest(validDto);

      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith(stubError);
    });
  });

  describe('updatePublicEventStatus', () => {
    let instance: PublicStatusHandler;
    const eventId = id;

    beforeEach(async () => {
      await PublicStatusHandler.init(mockDataSource as DataSource);
      instance = PublicStatusHandler.getInstance();
      // Stub submitRequest to track calls without executing the real implementation
      vi.spyOn(instance, 'submitRequest').mockResolvedValue(undefined);
    });

    /**
     * @target PublicStatusHandler.updatePublicEventStatus should throw an error when status is either "inPayment" or "inReward" and no transaction is found
     * @dependencies
     * @scenario
     * - stub txRepository.findOne to resolve to null
     * - call updateEventStatus with an eventId and status set to "inPayment" (or "inReward")
     * @expected
     * - an error should have been thrown with the correct message
     */
    it('should throw an error when status is either "inPayment" or "inReward" and no transaction is found', async () => {
      // Arrange
      (mockRepository.findOne as Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        instance.updatePublicEventStatus(eventId, EventStatus.inPayment)
      ).rejects.toThrowError(
        `a tx should have existed for eventId: ${eventId}, but none was found.`
      );
    });

    /**
     * @target PublicStatusHandler.updatePublicEventStatus should call submitRequest with the dto including transaction details when status is "inPayment" and a valid transaction is found
     * @dependencies
     * @scenario
     * - stub txRepository.findOne to resolve to a valid transaction object containing txId, type, and status for eventId provided
     * - spy on the submitRequest method
     * - call updateEventStatus with an eventId and status set to "inPayment"
     * @expected
     * - submitRequest should have been called with a dto where:
     *   - txId equals the transaction's txId
     *   - txType equals the transaction's type (should be TransactionType.payment)
     *   - txStatus equals the transaction's status
     */
    it('should call submitRequest with the dto including transaction details when status is "inPayment" and a valid transaction is found', async () => {
      // Arrange
      const transactionStub = {
        txId: 'tx-123',
        type: TransactionType.payment,
        status: 'completed',
      };
      (mockRepository.findOne as Mock).mockResolvedValue(transactionStub);

      // Act
      await instance.updatePublicEventStatus(eventId, EventStatus.inPayment);

      // Assert
      expect(instance.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          status: EventStatus.inPayment,
          txId: transactionStub.txId,
          txType: transactionStub.type,
          txStatus: transactionStub.status,
        })
      );
    });

    /**
     * @target PublicStatusHandler.updatePublicEventStatus should call submitRequest with the dto including transaction details when status is "inReward" and a valid transaction is found
     * @dependencies
     * @scenario
     * - stub txRepository.findOne to resolve to a valid transaction object containing txId, type, and status for eventId provided
     * - spy on the submitRequest method
     * - call updateEventStatus with an eventId and status set to "inReward"
     * @expected
     * - submitRequest should have been called with a dto where:
     *   - txId equals the transaction's txId
     *   - txType equals the transaction's type (should be TransactionType.reward)
     *   - txStatus equals the transaction's status
     */
    it('should call submitRequest with the dto including transaction details when status is "inReward" and a valid transaction is found', async () => {
      // Arrange
      const transactionStub = {
        txId: 'tx-456',
        type: TransactionType.reward,
        status: 'pending',
      };
      (mockRepository.findOne as Mock).mockResolvedValue(transactionStub);

      // Act
      await instance.updatePublicEventStatus(eventId, EventStatus.inReward);

      // Assert
      expect(instance.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          status: EventStatus.inReward,
          txId: transactionStub.txId,
          txType: transactionStub.type,
          txStatus: transactionStub.status,
        })
      );
    });

    /**
     * @target PublicStatusHandler.updatePublicEventStatus should call submitRequest with the dto without transaction details when status is neither "inPayment" nor "inReward"
     * @dependencies
     * @scenario
     * - spy on the submitRequest method
     * - call updateEventStatus with an eventId and status that is not "inPayment" or "inReward"
     * @expected
     * - submitRequest should have been called with a dto where:
     *   - txId remains undefined
     *   - txType remains undefined
     *   - txStatus remains undefined
     *   - eventId and status match the provided parameters
     */
    it('should call submitRequest with the dto without transaction details when status is neither "inPayment" nor "inReward"', async () => {
      // Arrange
      const status = 'pendingPayment';

      // Act
      await instance.updatePublicEventStatus(eventId, status);

      // Assert
      expect(instance.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          status,
          txId: undefined,
          txType: undefined,
          txStatus: undefined,
        })
      );
    });
  });

  describe('updatePublicTxStatus', () => {
    let instance: PublicStatusHandler;
    const txId = id;
    const newTxStatus = 'signed';

    beforeEach(async () => {
      await PublicStatusHandler.init(mockDataSource as DataSource);
      instance = PublicStatusHandler.getInstance();
      // Stub submitRequest to track calls
      vi.spyOn(instance, 'submitRequest').mockResolvedValue(undefined);
    });

    /**
     * @target PublicStatusHandler.updatePublicTxStatus should throw an error when no transaction with the given txId is found
     * @dependencies
     * @scenario
     * - stub txRepository.findOne to resolve to null when searching for the given txId
     * - call updateTxStatus with a txId and a txStatus
     * @expected
     * - an error should have been thrown with the correct message
     */
    it('should throw an error when no transaction with the given txId is found', async () => {
      // Arrange
      (mockRepository.findOne as Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        instance.updatePublicTxStatus(txId, newTxStatus)
      ).rejects.toThrowError(
        `a tx should have existed with id: ${txId}, but none was found.`
      );
    });

    /**
     * @target PublicStatusHandler.updatePublicTxStatus should call submitRequest with the dto built from the found transaction details when a valid transaction is found
     * @dependencies
     * @scenario
     * - stub txRepository.findOne to resolve to a valid transaction object containing:
     *   - txId: matching parameter
     *   - a related event object with id and status
     *   - type property for txType
     * - spy on the submitRequest method
     * - call updateTxStatus with a valid txId and a txStatus
     * @expected
     * - submitRequest should have been called with a dto where:
     *   - eventId equals the tx.event.id
     *   - status equals the tx.event.status
     *   - txId equals the provided txId
     *   - txType equals the tx.type
     *   - txStatus equals the provided txStatus
     */
    it('should call submitRequest with the dto built from the found transaction details when a valid transaction is found', async () => {
      // Arrange
      const transactionStub = {
        txId,
        type: 'some-tx-type',
        // The tx entity has a related event object:
        event: {
          id: 'event-2',
          status: 'active',
        },
      };
      (mockRepository.findOne as Mock).mockResolvedValue(transactionStub);

      // Act
      await instance.updatePublicTxStatus(txId, newTxStatus);

      // Assert
      expect(instance.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: transactionStub.event.id,
          status: transactionStub.event.status,
          txId: txId,
          txType: transactionStub.type,
          txStatus: newTxStatus,
        })
      );
    });
  });
});
