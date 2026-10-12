import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActionableHomeContent,
  homeFeedExploreAction,
  homeFeedItemAction,
  homeFirstValueActions,
} from "../src/features/home/home-first-value";
import {
  homeFeedAvatarUrl,
  homeFeedOrganizationVerificationLabel,
  homeFeedReasonAccessibilitySummary,
  homeFeedReasonLabels,
} from "../src/features/home/home-feed-presentation";
import type { FeedReasonCode } from "@losapuntes/contracts";

test("Home resources and questions target their existing detail routes", () => {
  const resource = homeFeedItemAction({
    type: "resource",
    id: "resource-1",
    title: "Resumen de Álgebra",
  });
  assert.deepEqual(resource?.href, {
    pathname: "/resources/[id]",
    params: { id: "resource-1" },
  });
  assert.equal(
    resource?.accessibilityLabel,
    "Abrir apunte: Resumen de Álgebra",
  );
  assert.match(resource?.accessibilityHint ?? "", /permisos actuales/);

  const question = homeFeedItemAction({
    type: "question",
    id: "question-1",
    title: "¿Cómo se resuelve este límite?",
  });
  assert.deepEqual(question?.href, {
    pathname: "/questions/[questionId]",
    params: { questionId: "question-1" },
  });
  assert.equal(
    question?.accessibilityLabel,
    "Abrir pregunta: ¿Cómo se resuelve este límite?",
  );
});

test("Home explains feed items only with the reason codes returned by the API", () => {
  const reasons: FeedReasonCode[] = [
    "current_subject",
    "prioritized_subject",
    "connection",
    "following",
    "organization_following",
    "interest_match",
    "unanswered_question",
    "fresh",
    "explicit_more",
    "exploration",
  ];

  assert.deepEqual(homeFeedReasonLabels(reasons), [
    "De tu materia actual",
    "De una materia priorizada",
    "De una conexión",
    "De alguien que seguís",
    "De una organización que seguís",
    "Relacionado con tus intereses",
    "Pregunta sin responder",
    "Publicado recientemente",
    "Por tu preferencia de ver más",
    "Para descubrir contenido",
  ]);
  assert.equal(
    homeFeedReasonAccessibilitySummary(["current_subject", "fresh"]),
    "Aparece porque: De tu materia actual, Publicado recientemente.",
  );
  assert.equal(homeFeedReasonAccessibilitySummary([]), null);
});

test("Home marks only organizations whose server state is verified", () => {
  assert.equal(
    homeFeedOrganizationVerificationLabel({
      kind: "campus_organization",
      organization: {
        id: "org-1",
        name: "Centro de Estudiantes",
        avatarUrl: null,
        verificationState: "verified",
      },
    }),
    "Organización verificada",
  );
  assert.equal(
    homeFeedOrganizationVerificationLabel({
      kind: "campus_organization",
      organization: {
        id: "org-1",
        name: "Centro de Estudiantes",
        avatarUrl: null,
        verificationState: "unverified",
      },
    }),
    null,
  );
  assert.equal(
    homeFeedOrganizationVerificationLabel({ kind: "personal_user" }),
    null,
  );
});

test("Home uses only the avatar belonging to the feed item's source", () => {
  assert.equal(
    homeFeedAvatarUrl({
      author: {
        profileId: "profile-1",
        displayName: "Ana Pérez",
        avatarUrl: "https://cdn.example.test/ana.png",
      },
      source: { kind: "personal_user" },
    }),
    "https://cdn.example.test/ana.png",
  );

  assert.equal(
    homeFeedAvatarUrl({
      author: {
        profileId: null,
        displayName: "Autor interno",
        avatarUrl: "https://cdn.example.test/author.png",
      },
      source: {
        kind: "campus_organization",
        organization: {
          id: "org-1",
          name: "Centro de Estudiantes",
          avatarUrl: "https://cdn.example.test/org.png",
          verificationState: "verified",
        },
      },
    }),
    "https://cdn.example.test/org.png",
  );

  assert.equal(
    homeFeedAvatarUrl({
      author: {
        profileId: null,
        displayName: "Autor interno",
        avatarUrl: "https://cdn.example.test/author.png",
      },
      source: {
        kind: "campus_organization",
        organization: {
          id: "org-1",
          name: "Centro de Estudiantes",
          avatarUrl: null,
          verificationState: "unverified",
        },
      },
    }),
    null,
  );
});

test("Home organization posts open their authorized organization detail", () => {
  const organization = homeFeedItemAction({
    type: "organization_post",
    id: "post-1",
    title: "Novedades",
    source: {
      kind: "campus_organization",
      organization: {
        id: "org-1",
        name: "Centro de Estudiantes",
        avatarUrl: null,
        verificationState: "verified",
      },
    },
  });

  assert.deepEqual(organization?.href, {
    pathname: "/organizations/[organizationId]",
    params: { organizationId: "org-1" },
  });
  assert.equal(
    organization?.accessibilityLabel,
    "Ver organización: Centro de Estudiantes",
  );
  assert.match(organization?.accessibilityHint ?? "", /comprobar/);

  assert.equal(
    homeFeedItemAction({
      type: "organization_post",
      id: "post-1",
      title: "Novedades",
      source: { kind: "personal_user" },
    }),
    null,
  );
});

test("empty Home actions link to Search and gate question creation on a current subject", () => {
  const withoutSubject = homeFirstValueActions(false);
  assert.deepEqual(
    withoutSubject.map((action) => [action.id, action.href]),
    [["search", "/(tabs)/search"]],
  );
  assert.equal(
    withoutSubject[0]?.accessibilityLabel,
    "Buscar apuntes y materias",
  );

  const withSubject = homeFirstValueActions(true);
  assert.deepEqual(
    withSubject.map((action) => [action.id, action.href]),
    [
      ["search", "/(tabs)/search"],
      ["question", "/questions/new"],
    ],
  );
  assert.match(withSubject[1]?.accessibilityHint ?? "", /pregunta académica/);
});

test("Home shows next-step actions only when no resource or question can be opened", () => {
  assert.equal(
    hasActionableHomeContent({
      items: [{ type: "organization_post", source: { kind: "personal_user" } }],
    }),
    false,
  );
  assert.equal(
    hasActionableHomeContent({
      items: [
        {
          type: "organization_post",
          source: {
            kind: "campus_organization",
            organization: {
              id: "org-1",
              name: "Centro de Estudiantes",
              avatarUrl: null,
              verificationState: "unverified",
            },
          },
        },
      ],
    }),
    true,
  );
  assert.equal(
    hasActionableHomeContent({
      items: [{ type: "resource" }],
    }),
    true,
  );
  assert.equal(
    hasActionableHomeContent({ items: [] }, { items: [{ type: "question" }] }),
    true,
  );
});

test("Home browse actions never pretend to resume the bounded cursor", () => {
  assert.equal(homeFeedExploreAction("subjects", false), null);
  assert.equal(homeFeedExploreAction("community", false), null);
  assert.equal(homeFeedExploreAction("for_you", false), null);

  const subjects = homeFeedExploreAction("subjects", true);
  assert.deepEqual(
    [subjects?.href, subjects?.label],
    ["/(tabs)/search", "Explorar en Buscar"],
  );
  assert.match(subjects?.accessibilityHint ?? "", /No continúa la misma tanda/);

  const community = homeFeedExploreAction("community", true);
  assert.deepEqual(
    [community?.href, community?.label],
    ["/(tabs)/network", "Explorar en Red"],
  );

  const forYou = homeFeedExploreAction("for_you", true);
  assert.equal(forYou?.href, "/(tabs)/search");
  assert.equal(forYou?.accessibilityLabel, "Explorar más contenido en Buscar");
});
