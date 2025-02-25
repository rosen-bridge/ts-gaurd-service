import { describe, it, expect, vi, beforeEach, MockInstance } from 'vitest';
import { EventTriggerEntity } from '@rosen-bridge/watcher-data-extractor';

import PublicStatusHandler from '../../../src/handlers/PublicStatusHandler';
import DatabaseActionMock from '../mocked/DatabaseAction.mock';
import { ConfirmedEventSubscriber } from '../../../src/db/subscribers/ConfirmedEventSubscriber';

describe('ConfirmedEventSubscriber', () => {
  const repo = DatabaseActionMock.testDatabase.ConfirmedEventRepository;
  let updatePublicEventStatusSpy: MockInstance<() => Promise<void>>;

  beforeEach(async () => {
    await DatabaseActionMock.clearTables();
    // Reset spy on PublicStatusHandler.updatePublicEventStatus before each test
    updatePublicEventStatusSpy = vi
      .spyOn(PublicStatusHandler.getInstance(), 'updatePublicEventStatus')
      .mockImplementation(async (): Promise<void> => {
        //
      });
  });

  describe('listenTo', () => {
    /**
     * @target ConfirmedEventSubscriber.listenTo should return ConfirmedEventEntity
     * @dependencies
     * @scenario
     * - create new ConfirmedEventSubscriber
     * - call listenTo
     * @expected
     * - returning class name should have been ConfirmedEventEntity
     */
    it('should return ConfirmedEventEntity', () => {
      // arrange
      const subscriber = new ConfirmedEventSubscriber();

      // act
      const result = subscriber.listenTo();

      // assert
      expect(result.name).toBe('ConfirmedEventEntity');
    });
  });

  /**
   * @target ConfirmedEventSubscriber.afterInsert should call PublicStatusHandler.updatePublicEventStatus with the correct id and status
   * @dependencies
   * @scenario
   * - call insert with a valid record
   * @expected
   * - updatePublicEventStatus should have been called with the correct id and status
   */
  describe('afterInsert', () => {
    it('should call PublicStatusHandler.updatePublicEventStatus with the correct id and status', async () => {
      // act
      await repo.insert({
        id: 'id',
        eventData: new EventTriggerEntity(),
        status: 'pending-payment',
      });

      // assert
      expect(updatePublicEventStatusSpy).toHaveBeenCalledWith(
        'id',
        'pending-payment'
      );
    });
  });

  describe('afterUpdate', () => {
    /**
     * @target ConfirmedEventSubscriber.afterUpdate should not call PublicStatusHandler.updatePublicEventStatus when updateEvent does not include a status change
     * @dependencies
     * @scenario
     * - call insert with a valid record
     * - call update with the same id to change a field thats not status
     * @expected
     * - updatePublicEventStatus should not have been called
     * - database record should have been updated correctly
     */
    it('should not call PublicStatusHandler.updatePublicEventStatus when updateEvent does not include a status change', async () => {
      // arrange
      await repo.insert({
        id: 'id',
        eventData: new EventTriggerEntity(),
        status: 'pending-payment',
      });

      // act
      updatePublicEventStatusSpy.mockReset();
      await repo.save({
        id: 'id',
        signFailedCount: 1,
      });

      // assert
      expect(updatePublicEventStatusSpy).not.toHaveBeenCalled();

      const record = await repo.findOneBy({
        id: 'id',
      });
      expect(record).toMatchObject({
        id: 'id',
        status: 'pending-payment',
      });
    });

    /**
     * @target ConfirmedEventSubscriber.afterUpdate should call PublicStatusHandler.updatePublicEventStatus with the correct id and new status when a status change occurs
     * @dependencies
     * @scenario
     * - call insert with a valid record
     * - call update with the same id to change status
     * @expected
     * - updatePublicEventStatus should have been called with the correct id and status
     * - database record should have been updated correctly
     */
    it('should call PublicStatusHandler.updatePublicEventStatus with the correct id and new status when a status change occurs', async () => {
      // arrange
      await repo.insert({
        id: 'id',
        eventData: new EventTriggerEntity(),
        status: 'pending-payment',
      });

      // act
      updatePublicEventStatusSpy.mockReset();
      await repo.save({
        id: 'id',
        status: 'completed',
      });

      // assert
      expect(updatePublicEventStatusSpy).toHaveBeenCalledWith(
        'id',
        'completed'
      );

      const record = await repo.findOneBy({
        id: 'id',
      });
      expect(record).toMatchObject({
        id: 'id',
        status: 'completed',
      });
    });
  });
});
