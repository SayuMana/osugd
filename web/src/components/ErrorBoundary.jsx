import { Component } from "react";
import ErrorPage from "../pages/ErrorPage.jsx";

// jaring terakhir: error saat render jangan sampai halaman jadi kosong
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-5 pb-14 md:px-6 md:pt-[22px] md:pb-16">
          <ErrorPage error={this.state.error} />
        </main>
      );
    }
    return this.props.children;
  }
}
