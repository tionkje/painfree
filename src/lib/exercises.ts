// The exercise program, checked in (was a seeded DB table). Edit this file to
// change the program — order here is the workout order. Images live in
// `static/exercises/<slug>.svg`, referenced by `image` below.

export type Exercise = {
  slug: string;
  name: string;
  // Short one-liner shown under the timer.
  description: string;
  // Longer form for the expandable "more detail" section. Plain text.
  details: string;
  // Path under static/ to a visual explanation.
  image: string;
  // Optional link to a video explaining the exercise.
  video?: string;
  // Reps per set, e.g. "6,4,2" for the McGill reverse pyramid.
  scheme: string;
  holdSeconds: number;
  // true = performed on each side (left/right).
  perSide: boolean;
};

// ponytail: `video` links point at a YouTube search, not a specific clip —
// swap in a canonical video URL per exercise when you have one.
export const exercises: Exercise[] = [
  {
    slug: 'curl-up',
    name: 'Modified Curl-Up',
    description:
      'Lie on your back, one knee bent, hands under the lower back. Lift head and shoulders slightly, keeping the neck neutral. Hold, then lower.',
    details:
      'Place both hands palm-down under the lumbar arch to keep the lower back in a neutral position — never flatten it to the floor. One leg is bent (foot flat), the other stays straight. Brace the abdominals, then lift the head, neck and shoulders as one rigid unit only a few centimetres off the floor; the movement is tiny. Keep the chin tucked and eyes on the ceiling so the neck does not crane. Breathe normally during the hold. Alternate the bent knee between sets.',
    image: '/exercises/curl-up.svg',
    video: 'https://www.youtube.com/results?search_query=mcgill+modified+curl+up',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: false
  },
  {
    slug: 'side-plank',
    name: 'Side Plank (Side Bridge)',
    description:
      'On your side, supported on the forearm and knees or feet, lift the hips to make a straight line. Keep the core braced. Hold, then lower.',
    details:
      'Lie on your side with the supporting elbow directly under the shoulder. Beginners bend the knees and support on knees + forearm; the harder version stacks the feet and supports on the feet. Brace the whole trunk and lift the hips until the body forms a straight line from head to knees (or feet) — no sagging and no piking up. Keep the top hand on the opposite shoulder or hip. Hold, lower under control, then switch sides.',
    image: '/exercises/side-plank.svg',
    video: 'https://www.youtube.com/results?search_query=mcgill+side+plank+side+bridge',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: true
  },
  {
    slug: 'bird-dog',
    name: 'Bird Dog',
    description:
      'On hands and knees, extend the opposite arm and leg straight out, keeping the back flat and hips level. Hold, then return.',
    details:
      'Start on hands and knees with hands under shoulders and knees under hips, back flat like a table. Brace the core, then extend one arm forwards and the opposite leg backwards until both are parallel to the floor. Keep the hips and shoulders square — do not let the pelvis rotate or the low back sag. Reach through the fingertips and the heel. Return to the start under control (some sweep the elbow to the knee between reps), then switch to the other diagonal.',
    image: '/exercises/bird-dog.svg',
    video: 'https://www.youtube.com/results?search_query=mcgill+bird+dog',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: true
  }
];
