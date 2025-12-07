import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";

import Home from "@/pages/Home";
import Directory from "@/pages/Directory";
import Chat from "@/pages/Chat";
import CreateProfile from "@/pages/CreateProfile";
import EditProfile from "@/pages/EditProfile";
import Login from "@/pages/Login";
import VerifyEmail from "@/pages/VerifyEmail";
import AuthCallback from "@/pages/AuthCallback";
import UserProfile from "@/pages/UserProfile";
import MyProfile from "@/pages/MyProfile";
import Connections from "@/pages/Connections";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/directory" component={Directory} />
        <Route path="/connections" component={Connections} />
        <Route path="/chat" component={Chat} />
        <Route path="/create-card" component={CreateProfile} />
        <Route path="/profile/edit" component={EditProfile} />
        <Route path="/my-profile" component={MyProfile} />
        <Route path="/profile/:id" component={UserProfile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
