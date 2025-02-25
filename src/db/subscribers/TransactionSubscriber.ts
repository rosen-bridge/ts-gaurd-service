import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { TransactionEntity } from '../entities/TransactionEntity';
import PublicStatusHandler from '../../../src/handlers/PublicStatusHandler';

@EventSubscriber()
export class TransactionSubscriber
  implements EntitySubscriberInterface<TransactionEntity>
{
  listenTo() {
    return TransactionEntity;
  }

  /**
   * called after entity insertion
   * @param insertEvent
   */
  afterInsert(insertEvent: InsertEvent<TransactionEntity>) {
    PublicStatusHandler.getInstance().updatePublicTxStatus(
      insertEvent.entity.txId,
      insertEvent.entity.status
    );
  }

  /**
   * called after entity update
   * @param updateEvent
   */
  afterUpdate(updateEvent: UpdateEvent<TransactionEntity>) {
    if (!updateEvent.entity) return;

    const updatedColumnsNames = updateEvent.updatedColumns.map(
      (column) => column.propertyName
    );

    const statusChanged = updatedColumnsNames.includes('status');

    if (statusChanged) {
      PublicStatusHandler.getInstance().updatePublicTxStatus(
        updateEvent.entity.txId,
        updateEvent.entity.status
      );
    }
  }
}
