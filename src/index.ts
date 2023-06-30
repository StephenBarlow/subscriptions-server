import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import bodyParser from 'body-parser';
import cors from 'cors';
import gql from 'graphql-tag';
import { buildSubgraphSchema } from '@apollo/subgraph';

const PORT = 4000;

// A number that we'll increment over time to simulate subscription events
let currentNumber = 0;

// Schema definition
const typeDefs = gql`
  type Query {
    currentNumber: Int
  }

  type Subscription {
    numberIncremented: Int
  }
`;

// Resolver map
const resolvers = {
  Query: {
    currentNumber() {
      return currentNumber;
    },
  },
  Subscription: {
    numberIncremented: {
      subscribe: async function* () {
        let count = 0;
        while (true) {
          yield { numberIncremented: count++ };
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (count === 1000) count = 0;
        }
      },
    },
  },
};

// Create schema, which will be used separately by ApolloServer and
// the WebSocket server.
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create an Express app and HTTP server; we will attach the WebSocket
// server and the ApolloServer to this HTTP server.
const app = express();
const httpServer = createServer(app);

// Set up WebSocket server.
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/ws',
});
const serverCleanup = useServer({ schema }, wsServer);

// Set up ApolloServer.
const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers}),
  // Introspection for GraphOS to grab the schema
  introspection: true,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),

    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();
app.use('/', cors(), bodyParser.json(), expressMiddleware(server));

// Now that our HTTP server is fully set up, actually listen.
httpServer.listen(PORT, () => {
  console.log(`🚀 CurrentNumber subgraph ready at http://localhost:${PORT}/`);
});
