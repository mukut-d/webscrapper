import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway(7000, {
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join')
  onJoin(@MessageBody() data: any): void {
    this.server.socketsJoin(data.userId);
    this.server.to(data.userId).emit('joinned', data);
  }
}
