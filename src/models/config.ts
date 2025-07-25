/*
 * Copyright (c) 1998-2025 KX Systems Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

export type InsightsConfig = {
  description?: string;
  encryptionInFlight?: boolean;
  installSize?: any;
  restricted?: boolean;
  storage?: any;
  version: string;
};

export type InsightsApiConfig = {
  encryptionDatabase: boolean;
  encryptionInTransit: boolean;
  queryEnvironmentsEnabled: boolean;
  version: string;
};

export type InsightsEndpoints = {
  scratchpad: {
    scratchpad: string;
    import: string;
    importSql: string;
    importQsql: string;
    importUDA: string;
    reset: string;
  };
  serviceGateway: {
    meta: string;
    data: string;
    sql: string;
    qsql: string;
    udaBase: string;
  };
};
