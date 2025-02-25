import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { ConfirmedEventEntity } from '../entities/ConfirmedEventEntity';
import PublicStatusHandler from '../../../src/handlers/PublicStatusHandler';

@EventSubscriber()
export class ConfirmedEventSubscriber
  implements EntitySubscriberInterface<ConfirmedEventEntity>
{
  listenTo() {
    return ConfirmedEventEntity;
  }

  /**
   * called after entity insertion
   * @param insertEvent
   */
  afterInsert(insertEvent: InsertEvent<ConfirmedEventEntity>) {
    PublicStatusHandler.getInstance().updatePublicEventStatus(
      insertEvent.entity.id,
      insertEvent.entity.status
    );
  }

  /**
   * called after entity update
   * @param updateEvent
   */
  afterUpdate(updateEvent: UpdateEvent<ConfirmedEventEntity>) {
    if (!updateEvent.entity) return;

    const updatedColumnsNames = updateEvent.updatedColumns.map(
      (column) => column.propertyName
    );

    const statusChanged = updatedColumnsNames.includes('status');

    if (statusChanged) {
      PublicStatusHandler.getInstance().updatePublicEventStatus(
        updateEvent.entity.id,
        updateEvent.entity.status
      );
    }
  }
}
