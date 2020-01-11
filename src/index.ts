import Bottleneck from "bottleneck";
import stringify from "csv-stringify";
import fs from "fs";
import got, { Response } from "got";
import stream, { Readable } from "stream";
import util from "util";
import winston from "winston";

export interface MainOptions {
  matcherPattern: string;
  outputFile: string;
  prefixUrl: string;
  eventId: number;
}

interface Item {
  pk: number;
  fields: Record<string, boolean | number | string>;
}

const pipeline = util.promisify(stream.pipeline);

const DEFAULT_PAGINATION_LIMIT = 500;

export async function main(options: MainOptions): Promise<void> {
  const matcher = new RegExp(options.matcherPattern, "i");

  const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.cli(),
    level: "debug",
  });

  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 2000,
  });

  const client = got.extend({
    prefixUrl: options.prefixUrl,
    responseType: "json",
  });

  const stringifier = stringify({
    columns: [
      {
        key: "id",
        header: "ID",
      },
      {
        key: "date",
        header: "Date",
      },
      {
        key: "name",
        header: "Name",
      },
      {
        key: "amount",
        header: "Amount",
      },
      {
        key: "comment",
        header: "Comment",
      },
    ],
    quoted: true,
    header: true,
    cast: {
      date: (value): string => value.toISOString(),
    },
  });

  async function* paginate(): AsyncIterable<object> {
    const cached = new Set<number>();

    let response: Response<Item[]>;
    let offset = 0;

    do {
      logger.debug(`Fetching offset ${offset}`);

      response = await limiter.schedule(() =>
        client.get("search", {
          searchParams: {
            limit: DEFAULT_PAGINATION_LIMIT,
            event: options.eventId,
            type: "donation",
            offset,
          },
        }),
      );

      for (const { pk, fields } of response.body) {
        if (cached.has(pk)) {
          continue;
        }

        if (matcher.test(fields.donor__public as string)) {
          const donation = {
            id: pk,
            date: new Date(fields.timereceived as string),
            name: fields.donor__public,
            amount: Number.parseFloat(fields.amount as string).toFixed(2),
            comment: fields.comment,
          };

          logger.debug(
            `Donation from ${donation.name} (ID: ${donation.id}; Amount: $${donation.amount})`,
          );

          yield donation;
        }

        cached.add(pk);
      }

      offset += DEFAULT_PAGINATION_LIMIT;
    } while (response.body.length >= DEFAULT_PAGINATION_LIMIT);
  }

  const readable = Readable.from(paginate(), { objectMode: true });
  const writable = fs.createWriteStream(options.outputFile);

  await pipeline(readable, stringifier, writable);
}
