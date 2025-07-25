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

export const onboardingWorkflow = {
  prompt: (qhome: string) =>
    `Installation of q runtime completed successfully to ${qhome}`, // ${ext.context.globalStorageUri.fsPath}`,
  option1: "Start q",
  option2: "Cancel",
};

export const onboardingInput = {
  prompt: "Enter the desired port number for q",
  placeholder: "5001",
};
