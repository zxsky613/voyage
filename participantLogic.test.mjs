import test from "node:test";
import assert from "node:assert/strict";
import { computeTricountBalances } from "./tricountLogic.js";
import {
  defaultPayerForParticipants,
  isParticipantRawCurrentUser,
  participantDisplayFromRawForTrip,
  participantsForExpenseSplit,
} from "./participantLogic.js";

const hostSession = {
  user: {
    id: "host-user",
    email: "host@example.com",
    user_metadata: { first_name: "Host" },
  },
};

const guestSession = {
  user: {
    id: "guest-user",
    email: "guest@example.com",
    user_metadata: { first_name: "Guest" },
  },
};

const sharedTrip = {
  id: "trip-1",
  owner_id: "host-user",
  participants: ["Moi", "guest@example.com"],
  invited_emails: ["guest@example.com"],
};

test("legacy empty invited_joined_emails keeps invited users in expense splits", () => {
  const participants = participantsForExpenseSplit(
    { ...sharedTrip, invited_joined_emails: [] },
    hostSession
  );

  assert.deepEqual(participants, ["Moi", "guest@example.com"]);
});

test("joined invitee list limits expense splits to joined members", () => {
  const participants = participantsForExpenseSplit(
    {
      ...sharedTrip,
      invited_emails: ["guest@example.com", "late@example.com"],
      invited_joined_emails: ["guest@example.com"],
    },
    hostSession
  );

  assert.deepEqual(participants, ["Moi", "guest@example.com"]);
});

test("invitee sees Moi as organizer and defaults new expenses to self", () => {
  const participants = participantsForExpenseSplit(
    { ...sharedTrip, invited_joined_emails: ["guest@example.com"] },
    guestSession
  );

  assert.equal(isParticipantRawCurrentUser("Moi", guestSession, sharedTrip), false);
  assert.equal(isParticipantRawCurrentUser("guest@example.com", guestSession, sharedTrip), true);
  assert.equal(
    participantDisplayFromRawForTrip("Moi", guestSession, sharedTrip, { firstName: "Alice", lastName: "Host" }),
    "Alice Host"
  );
  assert.equal(defaultPayerForParticipants(participants, guestSession, sharedTrip), "guest@example.com");
});

test("invitee-paid expense is balanced against the organizer, not mislabeled Moi", () => {
  const participants = participantsForExpenseSplit(
    { ...sharedTrip, invited_joined_emails: ["guest@example.com"] },
    guestSession
  );
  const balances = computeTricountBalances(participants, [
    { amount: 100, paid_by: defaultPayerForParticipants(participants, guestSession, sharedTrip), split_between: [] },
  ]);

  assert.equal(balances["guest@example.com"], 50);
  assert.equal(balances.Moi, -50);
});
