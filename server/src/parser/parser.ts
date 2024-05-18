/*
 * Copyright (c) 1998-2023 Kx Systems Inc.
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

import { QLexer } from "./lexer";
import {
  Command,
  Documentation,
  EndOfLine,
  LBracket,
  LCurly,
  LParen,
  LineComment,
  RBracket,
  RCurly,
  RParen,
  SemiColon,
  StringEscape,
  TestBlock,
  WhiteSpace,
  CommentEndOfLine,
  TestLambdaBlock,
  Colon,
  DoubleColon,
} from "./tokens";
import {
  CommentBegin,
  CommentEnd,
  ExitCommentBegin,
  TestBegin,
} from "./ranges";
import { CharLiteral, CommentLiteral } from "./literals";
import { Token, isFullyQualified, findScope } from "./utils";
import { Identifier, LSql, RSql } from "./keywords";
import { checkEscape } from "./checks";

interface State {
  index: number;
  order: number;
  scope: Token[];
  stack: Token[];
}

function scopped(token: Token) {
  if (!token.scopped) {
    token.scopped = [];
  }
  return token.scopped;
}

function collapse(tokens: Token[]) {
  if (tokens.length === 0) {
    return undefined;
  }
  const collapsed: Token[] = [];
  let token;
  while ((token = tokens.pop())) {
    collapsed.push(token);
  }
  return collapsed;
}

function peek(tokens: Token[]): Token | undefined {
  return tokens[tokens.length - 1];
}

function consume(state: State, token: Token) {
  const { stack } = state;
  let top;
  switch (token.tokenType) {
    case Identifier:
      top = peek(stack);
      if (top?.tokenType === Colon || top?.tokenType === DoubleColon) {
        stack.pop();
        token.assignment = collapse(stack);
        if (
          token.assignment &&
          top.tokenType === Colon &&
          !isFullyQualified(token)
        ) {
          token.local = findScope(token);
        }
      }
      stack.push(token);
      break;
    case SemiColon:
      collapse(stack);
      break;
    default:
      stack.push(token);
      break;
  }
}

function statement(state: State, tokens: Token[]) {
  const cache: Token[] = [];
  const scope: Token[] = [];

  let token, top;

  while ((token = tokens.shift())) {
    switch (token.tokenType) {
      case LParen:
        top = tokens[0];
        if (top?.tokenType === LBracket) {
          token.entangled = top;
        }
        scope.push(token);
        cache.push(token);
        break;
      case LBracket:
      case LCurly:
        top = tokens[0];
        if (top?.tokenType === LBracket) {
          token.entangled = top;
        }
        scope.push(token);
        cache.push(token);
        break;
      case RParen:
      case RBracket:
      case RCurly:
        scope.pop();
        cache.push(token);
        break;
      case SemiColon:
        top = peek(scope);
        if (top) {
          cache.push(token);
        } else {
          expression(state, cache);
          consume(state, token);
        }
        break;
      default:
        cache.push(token);
        break;
    }
  }
  expression(state, cache);
}

function expression(state: State, cache: Token[]) {
  const { scope } = state;
  let token, top;
  while ((token = cache.pop())) {
    switch (token.tokenType) {
      case LParen:
        top = scope.pop();
        if (top) {
          top.entangled = token.entangled;
          expression(state, scopped(top));
          consume(state, top);
        }
        break;
      case RParen:
        scope.push(token);
        break;
      case LBracket:
        top = scope.pop();
        if (top) {
          top.entangled = token.entangled;
          expression(state, scopped(top));
          consume(state, top);
        }
        break;
      case RBracket:
        scope.push(token);
        break;
      case LCurly:
        top = scope.pop();
        if (top) {
          top.entangled = token.entangled;
          statement(state, scopped(top));
          consume(state, top);
        }
        break;
      case RCurly:
        scope.push(token);
        break;
      case LSql:
        top = scope.pop();
        if (top) {
          top.entangled = token.entangled;
          expression(state, scopped(top));
          consume(state, top);
        }
        break;
      case RSql:
        scope.push(token);
        break;
      default:
        top = peek(scope);
        if (top) {
          scopped(top).unshift(token);
          token.scope = top;
        } else {
          consume(state, token);
        }
        break;
    }
  }
}

function isSkipped(token: Token) {
  switch (token.tokenType) {
    case CommentBegin:
    case CommentLiteral:
    case CommentEndOfLine:
    case CommentEnd:
    case Documentation:
    case LineComment:
    case WhiteSpace:
    case ExitCommentBegin:
      return true;
  }
  return false;
}

export function parse(text: string): Token[] {
  const result = QLexer.tokenize(text);
  const tokens = result.tokens as Token[];
  const cache: Token[] = [];

  const state: State = {
    index: 0,
    order: 1,
    stack: [],
    scope: [],
  };

  let namespace = "";
  let token, next, cmd, arg;

  for (let i = 0; i < tokens.length; i++) {
    token = tokens[i];
    token.namespace = namespace;
    token.index = i;
    state.index = i;

    switch (token.tokenType) {
      case EndOfLine:
        next = tokens[i + 1];
        if (next && !isSkipped(next)) {
          statement(state, cache);
        }
        break;
      case Command:
        {
          const [cmd, arg] = token.image.split(/\s+/, 2);
          switch (cmd) {
            case "\\d":
              if (arg) {
                namespace = arg.split(/\.+/, 2)[1] || "";
              }
              break;
          }
        }
        break;
      case StringEscape:
        checkEscape(token);
        break;
      case CharLiteral:
      case TestBegin:
      case TestBlock:
      case TestLambdaBlock:
        break;
      default:
        if (!isSkipped(token)) {
          cache.push(token);
        }
        break;
    }
  }
  statement(state, cache);
  return tokens;
}
