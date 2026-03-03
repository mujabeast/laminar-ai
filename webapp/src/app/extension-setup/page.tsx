import Link from "next/link";

export default function ExtensionSetupPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="panel space-y-3">
          <p className="eyebrow">Laminar.AI</p>
          <h1 className="section-title">Extension Setup</h1>
          <p className="section-copy max-w-3xl">
            The Laminar.AI Chrome extension records tab switching and confusion captures. It is not
            in the Chrome Web Store yet, so install it as an unpacked extension from this project.
          </p>
        </header>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">Install</p>
            <h2 className="text-2xl font-semibold text-slate-950">How to load it in Chrome</h2>
          </div>
          <div className="rounded-[1.5rem] border border-[#0f3d3e]/20 bg-[#0f3d3e]/6 px-5 py-5">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0f3d3e]">
              Actual File
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-950">
              `laminar-ai-extension.zip`
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              Download the packaged extension file here, unzip it on your computer, then use
              `Load unpacked` in Chrome on the extracted folder.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                className="button-primary"
                download
                href="/downloads/laminar-ai-extension.zip"
              >
                Download extension zip
              </a>
            </div>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-700">
            <li>Open Chrome and go to `chrome://extensions`.</li>
            <li>Turn on `Developer mode` in the top-right corner.</li>
            <li>Click `Load unpacked`.</li>
            <li>Select the extracted `extension` folder from the zip you downloaded.</li>
            <li>Pin the Laminar.AI Recorder extension if you want quick access while studying.</li>
          </ol>
        </section>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">What It Adds</p>
            <h2 className="text-2xl font-semibold text-slate-950">Why you should install it</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/75 px-4 py-4">
              <div className="font-semibold text-slate-900">Tab behavior</div>
              <div className="mt-2 text-sm text-slate-600">
                Detects when the student leaves the intended lecture or study site.
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/75 px-4 py-4">
              <div className="font-semibold text-slate-900">Confusion capture</div>
              <div className="mt-2 text-sm text-slate-600">
                Lets the student save a screenshot the moment they do not understand something.
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/75 px-4 py-4">
              <div className="font-semibold text-slate-900">Lock in mode</div>
              <div className="mt-2 text-sm text-slate-600">
                Enables the extension-side alarm behavior when the student exceeds the allowed tab
                exits.
              </div>
            </div>
          </div>
        </section>

        <section className="panel space-y-4">
          <div>
            <p className="eyebrow">After Install</p>
            <h2 className="text-2xl font-semibold text-slate-950">Normal flow</h2>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-700">
            <li>Create the study plan in Laminar.AI.</li>
            <li>Start the webcam session.</li>
            <li>Start recording in the extension.</li>
            <li>Use `Do Not Understand` whenever the student gets stuck.</li>
            <li>Stop the extension and export the JSON.</li>
            <li>Upload that JSON back into Laminar.AI.</li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <Link className="button-secondary" href="/focus">
              Back to plan
            </Link>
            <Link className="button-secondary" href="/import">
              Import extension JSON
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
